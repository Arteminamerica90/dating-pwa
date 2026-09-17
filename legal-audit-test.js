// ЮРИДИЧЕСКИЙ АУДИТ: соответствие заявленных в legal.html статей УК РФ и 152-ФЗ
// реальной реализации в api/[...path].js. Прогоняет реальные contains*/moderateText.

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const apiPath = path.join(__dirname, 'api', '[...path].js');
const src = fs.readFileSync(apiPath, 'utf8');
const lines = src.split('\n');

const startIdx = lines.findIndex((l) => l.startsWith('const PROFANITY_WORDS'));
let endIdx = lines.findIndex((l) => l.startsWith('function auditAction'));
if (startIdx === -1 || endIdx === -1) { console.error('Границы модерации не найдены'); process.exit(1); }
const block = lines.slice(startIdx, endIdx).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(block, ctx, { filename: 'moderation-block.js' });

// ============ 1. КАРТА СТАТЕЙ УК (заявленных в legal.html 2.10.8.x) ============
const uk = [
  {
    art: 'ст. 148 УК — оскорбление чувств верующих',
    must: ['оскорбляю чувства верующих', 'богохульство', 'кощунство во дворе храма', 'это святотатство'],
    label: 'religious_insult',
  },
  {
    art: 'ст. 282 УК — возбуждение ненависти по расовым/нац признакам',
    must: ['ненавижу хачей', 'жиды убили христа', 'черножопые вон из города', 'чучмеки позор', 'бей чурок'],
    label: 'hate',
  },
  {
    art: 'ст. 280 УК — призывы к экстремизму',
    must: ['призываю к экстремизму', 'хайль гитлер', 'нацисты правы', 'уничтожим иноземцев'],
    label: 'extremism',
  },
  {
    art: 'ст. 280.1 УК — призывы к нарушению территориальной целостности',
    must: ['требую отделения кавказа', 'независимость сибири', 'сепаратизм это хорошо'],
    label: 'separatism',
  },
  {
    art: 'ст. 205 УК — терроризм, оправдание',
    must: ['поддерживаю терроризм', 'да здравствует джихад', 'террористический акт оправдан', 'слава игил'],
    label: 'terrorism',
  },
  {
    art: 'ст. 228/228.1/230 УК — пропаганда наркотиков',
    must: ['продам кокаин', 'где купить гашиш', 'покурим травку', 'наркотики это круто', 'склоняю тебя к наркотам'],
    label: 'drugs',
  },
  {
    art: 'ст. 242.1/242.2 УК — детское порно, развратные действия',
    must: ['детское порно', 'познакомлюсь с малолеткой', 'ищу несовершеннолетнюю для интима', 'child porn', 'ср материалы'],
    label: 'child_exploitation',
  },
  {
    art: 'ст. 132/133/135 УК — понуждение к сексу (заявлено в legal 2.10.8.5)',
    must: ['заставлю тебя со мной переспать', 'понуждение к сексу сойдет', 'совершу развратные действия'],
    label: 'coercion',
  },
  {
    art: 'ст. 110/110.1 УК — доведение до самоубийства (критично для dating)',
    must: ['удавись', 'убей себя', 'повесься на суку', 'сделай это с собой'],
    label: 'suicide',
  },
  {
    art: 'ст. 134 УК — половое сношение с лицом до 16 лет',
    must: ['пересплю с 15-летней', 'встречусь с 14-леткой'],
    label: 'minor_sex',
  },
  {
    art: 'ст. 240/241 УК — сводничество, проституция',
    must: ['сниму проститутку', 'эскорт за деньги', 'интим за 5000'],
    label: 'prostitution',
  },
  {
    art: '255-ФЗ — иностранные агенты',
    must: ['иноагент финансирует', 'иностранный агент агитирует', 'послушал иностраного агента'],
    label: 'foreign_agent',
  },
];

let totalArt = 0, passArt = 0, failArt = 0;
const artFailures = [];
for (const a of uk) {
  for (const phrase of a.must) {
    totalArt++;
    const res = ctx.moderateText(phrase);
    if (res.action === 'block') passArt++;
    else {
      failArt++;
      artFailures.push({ art: a.art + ' (' + a.label + ')', phrase, actual: res.action, reasons: (res.reasons || []).join(',') });
    }
  }
}

// ============ 2. ФАЛЬШИВКИ: не должны блокироваться невинные фразы ============
const benign = [
  'сегодня хорошая погода', 'люблю гулять по парку', 'кофе утром обязательно',
  'пойдем в кино?', 'какая у тебя любимая музыка?', 'я работаю программистом',
  'у меня есть кошка', 'обожаю путешествия', 'закат сегодня красивый',
  'как прошел твой день?', 'спасибо за комплимент', 'надеюсь увидимся завтра',
  'кухня у меня маленькая, но уютная', 'хочу стать топ-менеджером',
  'независимость в отношениях важна', 'отделение мыслей это нормально',
  'детское кино мне нравится', 'снятие стресса помогает', 'интимный разговор по душам',
];
let passBenign = 0, failBenign = 0;
const benignFailures = [];
for (const phrase of benign) {
  const res = ctx.moderateText(phrase);
  if (res.action === 'allow') passBenign++;
  else { failBenign++; benignFailures.push({ phrase, action: res.action, reasons: (res.reasons || []).join(',') }); }
}

// ============ ВЫВОД ============
console.log('ЮРИДИЧЕСКИЙ АУДИТ: статьи УК РФ, заявленные в legal.html 2.10.8.x');
console.log(`Статьи УК/фраз: ${totalArt}  PASS: ${passArt}  FAIL: ${failArt}`);
for (const f of artFailures) {
  console.log(`  ❌ ${f.art}\n      фраза: "${f.phrase}" -> ${f.actual} (reasons: ${f.reasons || '—'})`);
}
console.log(`\nФальшивки (должны пропускаться): ${benign.length}  PASS: ${passBenign}  FAIL: ${failBenign}`);
for (const f of benignFailures) {
  console.log(`  ❌ "${f.phrase}" -> ${f.action} (reasons: ${f.reasons || '—'})`);
}

process.exit(failArt || failBenign ? 1 : 0);