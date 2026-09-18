// ХАРД-ТЕСТ ВРЕДОНОСНОГО КОНТЕНТА против реальных функций модерации api/[...path].js.
// Покрывает: порно/NSFW, нарушение религиозных прав, наци-символику (свастика и коды 1488),
// расовую/национальную вражду. Мультиязычность: RU, EN, DE, FR, ES, IT, PT, TR, UA, AR(транслит).
// Плюс контроль ложных срабатываний (невинные фразы на тех же языках ДОЛЖНЫ пропускаться).

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const apiPath = path.join(__dirname, 'api', '[...path].js');
const src = fs.readFileSync(apiPath, 'utf8');
const lines = src.split('\n');

const startIdx = lines.findIndex((l) => l.startsWith('const PROFANITY_WORDS'));
let endIdx = lines.findIndex((l) => l.startsWith('function auditAction'));
if (startIdx === -1 || endIdx === -1) {
  console.error('Не смог найти границы блока модерации');
  process.exit(1);
}
const block = lines.slice(startIdx, endIdx).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(block, ctx, { filename: 'moderation-block.js' });

// ============ КАТЕГОРИИ ВРЕДОНОСНОГО КОНТЕНТА ============
// action === 'block' → категория заблокирована модератором.
const harmful = [
  // ===== ПОРНО / NSFW (взрослый контент, продажа интим-услуг) =====
  { lang: 'RU', text: 'смотри порно бесплатно по ссылке', kind: 'porn' },
  { lang: 'RU', text: 'дам нюдсы за деньги', kind: 'porn' },
  { lang: 'RU', text: 'предлагаю интим за 3000 рублей', kind: 'porn' },
  { lang: 'RU', text: 'эротический массаж у меня дома', kind: 'porn' },
  { lang: 'RU', text: 'вебкам студия ищет моделей', kind: 'porn' },
  { lang: 'RU', text: 'сниму проститутку на ночь', kind: 'porn' },
  { lang: 'RU', text: 'записываю секс видео для подписчиков', kind: 'porn' },
  { lang: 'RU', text: 'ищу голые фото от незнакомцев', kind: 'porn' },
  { lang: 'EN', text: 'i sell nudes, dm me', kind: 'porn' },
  { lang: 'EN', text: 'watch me on webcam tonight', kind: 'porn' },
  { lang: 'EN', text: 'free porn videos in my profile', kind: 'porn' },
  { lang: 'EN', text: 'wanna fuck tonight?', kind: 'porn' },
  { lang: 'EN', text: 'my adult content onlyfans page', kind: 'porn' },
  { lang: 'EN', text: 'look at my tits baby', kind: 'porn' },
  { lang: 'EN', text: 'escort service incall Moscow', kind: 'porn' },
  { lang: 'DE', text: 'ich verkaufe nackte fotos', kind: 'porn' },
  { lang: 'DE', text: 'guck dir meinen porno an', kind: 'porn' },
  { lang: 'FR', text: 'regarde ma pornographie en ligne', kind: 'porn' },
  { lang: 'ES', text: 'te enseño porno en mi perfil', kind: 'porn' },
  { lang: 'IT', text: 'video porno a pagamento', kind: 'porn' },
  { lang: 'PT', text: 'venda de conteúdo adulto', kind: 'porn' },
  { lang: 'TR', text: 'porno izlemek ister misin', kind: 'porn' },
  { lang: 'UA', text: 'продаю порно фото у профілі', kind: 'porn' },

  // ===== НАРУШЕНИЕ РЕЛИГИОЗНЫХ ПРАВ =====
  { lang: 'RU', text: 'оскорбляю чувства верующих людей', kind: 'religion' },
  { lang: 'RU', text: 'это богохульство так поступать', kind: 'religion' },
  { lang: 'RU', text: 'святотатство в церкви', kind: 'religion' },
  { lang: 'RU', text: 'хула на бога и на веру', kind: 'religion' },
  { lang: 'RU', text: 'кощунство над святынями', kind: 'religion' },
  { lang: 'EN', text: 'blasphemy is my lifestyle', kind: 'religion' },
  { lang: 'EN', text: 'i desecrated the local church', kind: 'religion' },
  { lang: 'EN', text: 'god is dead and i killed him', kind: 'religion' },
  { lang: 'DE', text: 'Gotteslästerung ist mein Hobby', kind: 'religion' },
  { lang: 'DE', text: 'ich begehe Blasphemie überall', kind: 'religion' },
  { lang: 'FR', text: 'le blasphème est acceptable', kind: 'religion' },
  { lang: 'ES', text: 'la blasfemia no tiene límites', kind: 'religion' },
  { lang: 'IT', text: 'la blasfemia è un mio diritto', kind: 'religion' },
  { lang: 'AR', text: 'kufr est tout à fait ok', kind: 'religion' },

  // ===== НАЦИ-СИМВОЛИКА / СВАСТИКИ =====
  { lang: 'RU', text: 'набиваю свастику на плечо', kind: 'nazi' },
  { lang: 'RU', text: 'свастика во дворе нарисована', kind: 'nazi' },
  { lang: 'RU', text: 'хайль гитлер, зиг хайль', kind: 'nazi' },
  { lang: 'RU', text: 'я ярый нацист', kind: 'nazi' },
  { lang: 'RU', text: 'поддерживаю нацизм', kind: 'nazi' },
  { lang: 'EN', text: 'i draw swastikas on my jacket', kind: 'nazi' },
  { lang: 'EN', text: 'hakenkreuz flag on my wall', kind: 'nazi' },
  { lang: 'EN', text: 'heil hitler everyone', kind: 'nazi' },
  { lang: 'EN', text: 'white power brothers 1488', kind: 'nazi' },
  { lang: 'EN', text: '14 88 forever', kind: 'nazi' },
  { lang: 'EN', text: '14-88 in my bio', kind: 'nazi' },
  { lang: 'DE', text: 'Hakenkreuz ist mein Symbol', kind: 'nazi' },
  { lang: 'DE', text: 'Sieg Heil! Kameraden', kind: 'nazi' },
  { lang: 'ES', text: 'la esvástica es mi bandera', kind: 'nazi' },
  { lang: 'IT', text: 'la svastica nel mio profilo', kind: 'nazi' },
  { lang: 'AR', text: 'swastika in my profile pic', kind: 'nazi' },

  // ===== РАСОВАЯ / НАЦИОНАЛЬНАЯ ВРАЖДА =====
  { lang: 'RU', text: 'ненавижу хачей и чучмеков', kind: 'hate' },
  { lang: 'RU', text: 'жиды правят миром', kind: 'hate' },
  { lang: 'RU', text: 'черножопые вон из города', kind: 'hate' },
  { lang: 'EN', text: 'kill all niggers', kind: 'hate' },
  { lang: 'EN', text: 'jews are the problem', kind: 'hate' },
  { lang: 'EN', text: 'get out spics and chinks', kind: 'hate' },
  { lang: 'DE', text: 'Juden raus aus Deutschland', kind: 'hate' },

  // ===== ТЕРРОРИЗМ / НАРКОТИКИ / СУИЦИД / ПРИНУЖДЕНИЕ (бонус-категории) =====
  { lang: 'EN', text: 'i support isis and taliban', kind: 'terrorism' },
  { lang: 'EN', text: 'make a suicide bomb threat', kind: 'terrorism' },
  { lang: 'EN', text: 'buy cocaine and meth here', kind: 'drugs' },
  { lang: 'EN', text: 'i will kill myself tonight', kind: 'suicide' },
  { lang: 'RU', text: 'убей себя, не живи', kind: 'suicide' },
  { lang: 'EN', text: 'i will rape you at the meeting', kind: 'coercion' },
  { lang: 'EN', text: 'send me child porn', kind: 'child_exploitation' },
];

// ============ НЕВИННЫЕ ФРАЗЫ (НЕ ДОЛЖНЫ БЛОКИРОВАТЬСЯ) ============
const benign = [
  { lang: 'RU', text: 'люблю гулять по парку и слушать музыку' },
  { lang: 'RU', text: 'работаю программистом, мечтаю о путешествиях' },
  { lang: 'RU', text: 'сегодня отличная погода для прогулки' },
  { lang: 'RU', text: 'анализ моих увлечений показывает любовь к книгам' },
  { lang: 'RU', text: 'у меня есть кот, зовут Барсик' },
  { lang: 'EN', text: 'i love cooking italian pasta' },
  { lang: 'EN', text: 'my analysis of the situation is simple' },
  { lang: 'EN', text: 'let us go to the cinema tomorrow' },
  { lang: 'EN', text: 'blessed day, happy to be here' },
  { lang: 'EN', text: 'I run southwest and southwest is cool' },
  { lang: 'DE', text: 'das Wetter ist wunderschön' },
  { lang: 'DE', text: 'ich liebe amerikanische Küche' },
  { lang: 'FR', text: 'bonjour, comment ça va ce soir' },
  { lang: 'FR', text: 'je vais au musée samedi' },
  { lang: 'ES', text: 'hola, me llamo Ana y me gusta bailar' },
  { lang: 'IT', text: 'ciao, mi piace il mare e la montagna' },
  { lang: 'PT', text: 'bom dia, adoro viajar' },
  { lang: 'TR', text: 'merhaba, nasılsın bugün' },
  { lang: 'UA', text: 'добрий день, я люблю прогулянки' },
];

// ============ ПРОГОН ============
let pass = 0, fail = 0;
const failures = [];
for (const c of harmful) {
  const res = ctx.moderateText(c.text);
  const ok = res.action === 'block' || (res.blockedReasons || []).length > 0;
  if (ok) pass++;
  else {
    fail++;
    failures.push({ type: `❌ [${c.lang}|${c.kind}]`, text: c.text, actual: `${res.action} (${(res.reasons || []).join(',') || '—'})` });
  }
}

let bPass = 0, bFail = 0;
const benignFailures = [];
for (const c of benign) {
  const res = ctx.moderateText(c.text);
  const ok = res.action === 'allow';
  if (ok) bPass++;
  else {
    bFail++;
    benignFailures.push({ type: `❌ [${c.lang}] невинное: "${c.text}"`, actual: `${res.action} (${(res.reasons || []).join(',') || '—'})` });
  }
}

console.log('ХАРД-ТЕСТ ВРЕДОНОСНОГО КОНТЕНТА (все языки) против api/[...path].js');
console.log(`Вредоносные (должны БЛОКИРОВАТЬСЯ): ${harmful.length}  PASS: ${pass}  FAIL: ${fail}`);
for (const f of failures) console.log(`  ${f.type} "${f.text}" → получено ${f.actual}`);
console.log(`\nНевинные (должны ПРОПУСКАТЬСЯ): ${benign.length}  PASS: ${bPass}  FAIL: ${bFail}`);
for (const f of benignFailures) console.log(`  ${f.type} → получено ${f.actual}`);
console.log();
process.exit(fail || bFail ? 1 : 0);