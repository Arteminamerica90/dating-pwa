// Глубокие тесты NSFW-фото против РЕАЛЬНОЙ photoAnalysisVerdict из api/[...path].js
// Плюс эмуляция клиентской скин-детекции по canvas (шаг 16 пикселей) для разных типов кадра.

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const apiPath = path.join(__dirname, 'api', '[...path].js');
const src = fs.readFileSync(apiPath, 'utf8');
const lines = src.split('\n');

const startIdx = lines.findIndex((l) => l.startsWith('const NSFW_SKIN_HARD_LIMIT'));
let endIdx = lines.findIndex((l) => l.startsWith('async function handlePhotoAnalyze'));
if (startIdx === -1 || endIdx === -1) {
  console.error('Не смог найти границы блока NSFW');
  process.exit(1);
}
const block = lines.slice(startIdx, endIdx).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(block, ctx, { filename: 'nsfw-block.js' });

// ===== 1. Прямые проверки вердиктов (реальная функция) =====
const verdictCases = [
  { name: 'чистое фото (0%)', skinRatio: 0, dims: { w: 800, h: 600 }, expected: 'ok' },
  { name: 'легентое платье (5%)', skinRatio: 0.05, dims: { w: 800, h: 600 }, expected: 'ok' },
  { name: 'руки/лицо (15%)', skinRatio: 0.15, dims: { w: 800, h: 600 }, expected: 'ok' },
  { name: 'граница review 0.28', skinRatio: 0.28, dims: { w: 800, h: 600 }, expected: 'review' },
  { name: 'короткие шорты (30%)', skinRatio: 0.30, dims: { w: 800, h: 600 }, expected: 'review' },
  { name: 'топливное тело (37%)', skinRatio: 0.37, dims: { w: 800, h: 600 }, expected: 'review' },
  { name: 'нижняя граница hard 0.45', skinRatio: 0.45, dims: { w: 800, h: 600 }, expected: 'reject' },
  { name: 'бикини (52%)', skinRatio: 0.52, dims: { w: 800, h: 600 }, expected: 'reject' },
  { name: 'обнажённое (61%)', skinRatio: 0.61, dims: { w: 800, h: 600 }, expected: 'reject' },
  { name: 'почти всё открыто (78%)', skinRatio: 0.78, dims: { w: 800, h: 600 }, expected: 'reject' },
  { name: 'панта-пузо (12%)', skinRatio: 0.12, dims: { w: 800, h: 600 }, expected: 'ok' },
  { name: 'отрицательное значение', skinRatio: -0.5, dims: null, expected: 'ok' },
  { name: 'NaN', skinRatio: NaN, dims: null, expected: 'ok' },
  { name: 'огромное (1.0)', skinRatio: 1.0, dims: { w: 1200, h: 900 }, expected: 'reject' },
];

// ===== 2. Эмуляция клиентской детекции: скин-пиксели по области и итог по шагу 16 =====
// Строим лист ImageData (w*h), кладём "skin-пиксели" в заданную область, считаем sampleRatio
// как делает app.js (выборка каждого 16-го пикселя), затем прогоняем через реальный verdict.

function buildData(width, height, skinFn) {
  const px = new Float64Array(width * height); // 1 = skin
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (skinFn(x, y)) px[y * width + x] = 1;
    }
  }
  return { width, height, px };
}

function sampleSkinRatio(data) {
  let skin = 0, total = 0;
  for (let y = 0; y < data.height; y += 16) {
    for (let x = 0; x < data.width; x += 16) {
      total++;
      if (data.px[y * data.width + x]) skin++;
    }
  }
  return total ? skin / total : 0;
}

const frameCases = [
  {
    name: 'голова+плечи (портрет): кожа только в верхней 25%',
    w: 600, h: 800, skinFn: (x, y) => y < 200 && x > 150 && x < 450,
    expectApprox: (r) => r < 0.28,
  },
  {
    name: 'селфи в пол-роста: кожа верхние 40%',
    w: 600, h: 800, skinFn: (x, y) => y < 320,
    expectApprox: (r) => r < 0.45, // borderline review/ok — проверяем что не reject
  },
  {
    name: 'пляж в купальнике: большая центральная зона',
    w: 800, h: 600, skinFn: (x, y) => x > 250 && x < 550 && y > 150 && y < 500,
    expectApprox: (r) => r > 0.15 && r < 0.45, // детектирован скин, но хард-лимита нет
  },
  {
    name: 'откровенное: почти весь кадр',
    w: 800, h: 600, skinFn: () => true,
    expectApprox: (r) => r >= 0.45,
  },
  {
    name: 'скриншот чата (без кожи)',
    w: 400, h: 800, skinFn: () => false,
    expectApprox: (r) => r < 0.1,
  },
  {
    name: 'несколько людей в кадре (сложная площадь)',
    w: 1000, h: 700, skinFn: (x, y) => (x < 300 && y < 350) || (x > 700 && y < 350),
    expectApprox: (r) => r < 0.45,
  },
];

const allFailures = [];
let verdictPass = 0, verdictFail = 0;
for (const c of verdictCases) {
  const res = ctx.photoAnalysisVerdict({ skinRatio: c.skinRatio, dims: c.dims });
  const ok = res.verdict === c.expected;
  if (ok) verdictPass++;
  else { verdictFail++; allFailures.push({ name: c.name, expected: c.expected, actual: res.verdict }); }
}

let framePass = 0, frameFail = 0;
for (const c of frameCases) {
  const data = buildData(c.w, c.h, c.skinFn);
  const ratio = sampleSkinRatio(data);
  const res = ctx.photoAnalysisVerdict({ skinRatio: ratio, dims: { w: c.w, h: c.h } });
  let ok = false;
  try {
    ok = c.expectApprox(ratio);
  } catch (e) {
    ok = false;
  }
  if (ok) framePass++;
  else { frameFail++; allFailures.push({ name: c.name, expected: c.expectApprox.toString(), actual: `ratio=${ratio.toFixed(3)} verdict=${res.verdict}` }); }
}

console.log('ГЛУБОКИЕ ТЕСТЫ NSFW против api/[...path].js (реальные константы + verdict)');
console.log(`Вердикты: ${verdictCases.length}  PASS: ${verdictPass}  FAIL: ${verdictFail}`);
console.log(`Кинематика кадра: ${frameCases.length}  PASS: ${framePass}  FAIL: ${frameFail}`);
console.log('Документированное ограничение: стена цвета тела (однотонный "псевдо-skin")');
console.log('  → даёт ratio≈1.0 и вердикт reject. Это ложное срабатывание эвристики по цвету;');
console.log('  для промышленности нужна CNN/классодер. Отмечено как TODO.');
console.log();
for (const f of allFailures) console.log(`  ❌ ${f.name}: ожидалось ${f.expected}, получено ${f.actual}`);
process.exit(verdictFail || frameFail ? 1 : 0);