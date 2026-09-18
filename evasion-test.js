// Глубокие тесты на evasion-обходы модерации против РЕАЛЬНЫХ функций api/[...path].js
// Извлекаем чистый блок модерации (константы списков + contains*/normalize/censorText/moderateText)
// и исполняем в VM — без сетевых зависимостей.

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

function moderateTextProto(text) {
  // Прототип moderateText: profanity→censor, блок-списки→block. Это зеркалит production moderateText.
  const checks = [
    ['extremism', ctx.containsExtremism(text)],
    ['religious_insult', ctx.containsReligiousInsult(text)],
    ['terrorism', ctx.containsTerrorism(text)],
    ['separatism', ctx.containsSeparatism(text)],
    ['drugs', ctx.containsDrugs(text)],
    ['child_exploitation', ctx.containsCP(text)],
    ['foreign_agent', ctx.containsForeignAgent(text)],
    ['extremist_material', ctx.containsExtremistMaterial(text)],
    ['prostitution', ctx.containsProstitution(text)],
    ['nsfw', ctx.containsNsfw(text)],
    ['suicide', ctx.containsSuicide(text)],
    ['unrest', ctx.containsUnrest(text)],
    ['lgbt_propaganda', ctx.containsLgbtPropaganda(text)],
    ['tobacco', ctx.containsTobacco(text)],
  ];
  const blocked = checks.filter(([, v]) => v).map(([k]) => k);
  if (blocked.length) return { allowed: false, blocked: true, action: 'block', blockedReasons: blocked };
  if (ctx.containsProfanity(text)) return { allowed: false, blocked: false, action: 'censor' };
  return { allowed: true, action: 'allow' };
}

const testCases = [
  // ===== МАТ (должен ЦЕНЗУРИРОВАТЬ) =====
  { action: 'censor', input: 'хуй', note: 'base' },
  { action: 'censor', input: 'hui', note: 'translit латиницей' },
  { action: 'censor', input: 'ХуЙ', note: 'camelCase' },
  { action: 'censor', input: 'хyй', note: 'homoglyph y→у' },
  { action: 'censor', input: 'хуи', note: 'множественное' },
  { action: 'censor', input: 'xуй', note: 'homoglyph x→х' },
  { action: 'censor', input: 'h.u.i', note: 'разделители точек' },
  { action: 'censor', input: 'блядь', note: 'base' },
  { action: 'censor', input: 'blядь', note: 'translit б→b' },
  { action: 'censor', input: 'блядb', note: 'translit ь→b' },
  { action: 'censor', input: 'b.l.я.d.b', note: 'точки между буквами' },
  { action: 'censor', input: 'ебать', note: 'base' },
  { action: 'censor', input: 'ebat', note: 'translit ебать' },
  { action: 'censor', input: 'ёб твою мать', note: 'ё→е нормализация' },
  { action: 'censor', input: 'сука', note: 'base' },
  { action: 'censor', input: 'suka', note: 'translit сука' },
  { action: 'censor', input: 'пиздец', note: 'pиздец homoglyph p→п' },

  // ===== ТЕРРОРИЗМ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'поддерживаю терроризм', note: 'base' },
  { action: 'block', input: 'поддерживаю terrorism', note: 'латиница' },
  { action: 'block', input: 'террорист', note: 'base' },
  { action: 'block', input: 'терpopист', note: 'homoglyph o→о' },

  // ===== ЭКСТРЕМИЗМ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'я нацист', note: 'base' },
  { action: 'block', input: 'nazi', note: 'латиница' },
  { action: 'block', input: 'нацик', note: 'сленг' },
  { action: 'block', input: 'фашист', note: 'base' },

  // ===== НАРКОТИКИ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'где купить наркотик', note: 'base' },
  { action: 'block', input: 'где купить наркоту', note: 'сленг' },
  { action: 'block', input: 'где купить drugs', note: 'англ' },
  { action: 'block', input: 'где купить кокс', note: 'сленг' },
  { action: 'block', input: 'где купить травку', note: 'сленг травка' },

  // ===== ИНОАГЕНТЫ =====
  { action: 'block', input: 'прочитал от иностранного агента', note: 'base' },
  { action: 'block', input: 'иноагент пишет', note: 'base' },
  { action: 'block', input: 'иностраный агент', note: 'опечатка' },

  // ===== РЕЛИГИЯ =====
  { action: 'block', input: 'это богохульство', note: 'base' },

  // ===== СЕПАРАТИЗМ =====
  { action: 'block', input: 'за отделение края', note: 'base' },

  // ===== CSAM =====
  { action: 'block', input: 'child porn', note: 'base' },
  { action: 'block', input: 'cp материалы', note: 'аббр. homoglyph c→с p→р' },

  // ===== NSFW / ПОРНОКОНТЕНТ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'смотри порно', note: 'base порно' },
  { action: 'block', input: 'pornhub', note: 'порносайт латиницей' },
  { action: 'block', input: 'fuck you', note: 'latin fuck' },
  { action: 'block', input: 'нюдсы пришли', note: 'base nudes' },
  { action: 'block', input: 'обнаженное тело', note: 'обнажённое' },
  { action: 'block', input: 'эротический массаж', note: 'эротик' },
  { action: 'block', input: 'отсос за деньги', note: 'вульг. действие' },
  { action: 'block', input: 'минет с тобой', note: 'вульг. действие' },
  { action: 'block', input: 'эскорт услуги', note: 'проституция-эскорт' },
  { action: 'block', input: 'интим за деньги', note: 'проституция' },
  { action: 'block', input: 'девушка по вызову', note: 'проституция' },
  { action: 'block', input: 'вебкам студия', note: 'секс-трансляции' },
  { action: 'block', input: 'adult content', note: 'latin adult' },
  { action: 'block', input: 'секс игрушки', note: 'эрот. товары' },
  { action: 'block', input: 'массаж с продолжением', note: 'эвфемизм' },
  { action: 'block', input: 'голые фото в профиле', note: 'голые фото' },
  { action: 'block', input: 'секс видео скину', note: 'секс видео' },
  { action: 'block', input: 'покажу naked', note: 'latin naked' },
  { action: 'block', input: 'взрослый контент', note: 'взрослый контент' },
  { action: 'block', input: 'мастурбация', note: 'мастурбац' },

  // ===== МАССОВЫЕ БЕСПОРЯДКИ/ПЕРЕВОРОТ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'призываю к перевороту', note: 'unrest base' },
  { action: 'block', input: 'свергнем власть', note: 'unrest' },
  { action: 'block', input: 'устроим массовые беспорядки', note: 'unrest' },
  { action: 'block', input: 'организуем бунт', note: 'unrest бунт' },
  { action: 'block', input: 'join the riot', note: 'unrest латиница' },
  { action: 'block', input: 'overthrow the government', note: 'unrest латиница' },
  { action: 'block', input: 'storm the parliament', note: 'unrest латиница' },
  { action: 'block', input: 'захватим власть', note: 'unrest захват' },

  // ===== ПРОПАГАНДА ЛГБТ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'веду пропаганду лгбт', note: 'lgbt base' },
  { action: 'block', input: 'пропагандирую гомосексуализм', note: 'lgbt гомо' },
  { action: 'block', input: 'агитирую за лгбт', note: 'lgbt агитация' },
  { action: 'block', input: 'spread lgbt propaganda', note: 'lgbt латиница' },
  { action: 'block', input: 'promote lgbt rights', note: 'lgbt латиница' },
  { action: 'block', input: 'gay propaganda', note: 'lgbt латиница gay' },

  // ===== ПРОДАЖА/РЕКЛАМА ТАБАКА (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'продаю сигареты оптом', note: 'tobacco сигареты' },
  { action: 'block', input: 'вейп в наличии у меня', note: 'tobacco вейп' },
  { action: 'block', input: 'sell cigarettes cheap', note: 'tobacco латиница' },
  { action: 'block', input: 'vapes for sale', note: 'tobacco латиница vape' },

  // ===== НАРКОТИКИ: СЛЕНГ/РАСШИРЕНИЯ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'купить экстази', note: 'drugs экстази' },
  { action: 'block', input: 'продаю соль для ванн', note: 'drugs соль для ванн' },
  { action: 'block', input: 'есть трамадол', note: 'drugs трамадол' },
  { action: 'block', input: 'мефедрон на складе', note: 'drugs мефедрон' },
  { action: 'block', input: 'cannabis club', note: 'drugs латиница' },

  // ===== СУИЦИД: РАСШИРЕННЫЕ ФОРМЫ (должен БЛОКИРОВАТЬ) =====
  { action: 'block', input: 'хочу покончить с собой', note: 'suicide' },
  { action: 'block', input: 'повешусь скоро', note: 'suicide' },
  { action: 'block', input: 'no reason to live', note: 'suicide латиница' },
  { action: 'block', input: 'hang myself', note: 'suicide латиница' },

  // ===== ФАЛЬШИВКИ (должны ПРОПУСКАТЬСЯ) =====
  { action: 'allow', input: 'я люблю кухню', note: 'кухня ≠ хуй: нет подстроки' },
  { action: 'allow', input: 'сегодня хорошая погода', note: 'нейтральный текст' },
  { action: 'allow', input: 'расскажи о себе', note: 'rasskazhi не матчится как ass' },
  { action: 'allow', input: 'грудь мира нет', note: 'грудь без сиськи — не NSFW' },
  { action: 'allow', input: 'пойдем в кино', note: 'нейтрально' },
  { action: 'allow', input: 'люблю готовить ужин', note: 'нейтрально' },
  { action: 'allow', input: 'я гей и ищу друзей', note: 'самоидентификация ≠ пропаганда' },
  { action: 'allow', input: 'курю редко', note: 'не реклама табака' },
  { action: 'allow', input: 'восстание машин — фильм', note: 'не призыв к перевороту' },
  { action: 'allow', input: 'пропаганда здорового образа жизни', note: 'нет лгбт-строк' },
  { action: 'allow', input: 'i am gay looking for friends', note: 'самоидентификация латиницей' },
];

let pass = 0, fail = 0;
const failures = [];
for (const c of testCases) {
  const res = moderateTextProto(c.input);
  const actual = res.action;
  const ok = actual === c.action;
  if (ok) pass++;
  else { fail++; failures.push({ ...c, actual }); }
}

// Проверка цензуры: обходные матные формы должны реально маскироваться звёздочками.
const censorCases = [
  { input: 'ты hui какой-то', expected: /ты \*+\* какой-то/, note: 'translit hui маскируется' },
  { input: 'blyat, ну ты даёшь', expected: /^\*+, ну ты даёшь$/, note: 'translit blyat' },
  { input: 'привет, blya', expected: /привет, \*+/, note: 'translit blya' },
  { input: 'хyй с тобой', expected: /\*+ с тобой/, note: 'homoglyph y→у' },
  { input: 'suka ты', expected: /\*+ ты/, note: 'translit suka' },
  { input: 'еб твою мать', expected: /\*+ твою мать/, note: 'ё→е отдельное слово' },
];
let cPass = 0, cFail = 0;
for (const c of censorCases) {
  const actualMasked = String(ctx.censorText(c.input));
  const ok = c.expected.test(actualMasked);
  if (ok) cPass++;
  else { cFail++; failures.push({ note: `цензура: ${c.note}`, input: c.input, expected: `${c.expected}`, actual: `«${actualMasked}»` }); }
}

console.log('ГЛУБОКИЕ ТЕСТЫ EVASION против api/[...path].js (реальные contains*)');
console.log(`Всего текстовых: ${testCases.length}  PASS: ${pass}  FAIL: ${fail}`);
console.log(`Цензура обходных форм: ${censorCases.length}  PASS: ${cPass}  FAIL: ${cFail}\n`);
for (const f of failures) {
  console.log(`  ❌ [${f.note}] "${f.input}" → ожидалось ${f.action ?? f.expected}, получено ${f.actual ?? JSON.stringify(f)}`);
}
process.exit(fail || cFail ? 1 : 0);