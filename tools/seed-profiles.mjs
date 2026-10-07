import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const dataSrc = fs.readFileSync(path.join(ROOT, 'questionnaire-data.js'), 'utf8');

function exportArray(name) {
  const i = dataSrc.indexOf(`export const ${name} = [`);
  if (i < 0) throw new Error(`${name} not found`);
  const start = dataSrc.indexOf('[', i);
  let depth = 0;
  for (let j = start; j < dataSrc.length; j += 1) {
    if (dataSrc[j] === '[') depth += 1;
    else if (dataSrc[j] === ']') {
      depth -= 1;
      if (depth === 0) return Function(`"use strict";return (${dataSrc.slice(start, j + 1)});`)();
    }
  }
  throw new Error(`${name} unbalanced`);
}

const FULL_QUESTIONS = exportArray('FULL_QUESTIONNAIRE');

// Психологический блок лежит прямо в app.js — вытащим его оттуда, чтобы совпадали id.
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function appConstArray(name) {
  const i = appSrc.indexOf(`const ${name} = [`);
  if (i < 0) throw new Error(`${name} not found in app.js`);
  const start = appSrc.indexOf('[', i);
  let depth = 0;
  for (let j = start; j < appSrc.length; j += 1) {
    if (appSrc[j] === '[') depth += 1;
    else if (appSrc[j] === ']') {
      depth -= 1;
      if (depth === 0) return Function(`"use strict";return (${appSrc.slice(start, j + 1)});`)();
    }
  }
  throw new Error(`${name} unbalanced`);
}
const PSYCH_QUESTIONS = appConstArray('QUESTIONNAIRE');
const ALL_QUESTIONS = [...PSYCH_QUESTIONS, ...FULL_QUESTIONS];

const CITY_ANSWER_TO_KEY = { a: 'Moscow', b: 'Saint Petersburg', c: 'Kazan', d: 'Novosibirsk' };
const CITY_KEY_TO_ANSWER = Object.fromEntries(Object.entries(CITY_ANSWER_TO_KEY).map(([k, v]) => [v, k]));
const CITY_NAME = {
  Moscow: 'Москва',
  'Saint Petersburg': 'Санкт-Петербург',
  Kazan: 'Казань',
  Novosibirsk: 'Новосибирск'
};
const ZODIAC_ANSWER_TO_LABEL = {
  a: 'Овен', b: 'Телец', c: 'Близнецы', d: 'Рак', e: 'Лев', f: 'Дева',
  g: 'Весы', h: 'Скорпион', i: 'Стрелец', j: 'Козерог', k: 'Водолей', l: 'Рыбы'
};

function optionsFor(q, gender) {
  if (gender === 'm' && Array.isArray(q.optionsM)) return q.optionsM;
  if (gender === 'f' && Array.isArray(q.optionsF)) return q.optionsF;
  if (Array.isArray(q.options)) return q.options;
  if (Array.isArray(q.optionsM)) return q.optionsM;
  if (Array.isArray(q.optionsF)) return q.optionsF;
  return [];
}

// Детерминированный PRNG, чтобы анкеты были воспроизводимы.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Раскладка весов для ключевых категорий: persona -> список «любимых» значений option.value.
const PERSONAS = [
  {
    name: 'Анна', gender: 'f', group: 'warm', age: 29, city: 'Moscow', zodiac: 'Стрелец',
    job: 'Продуктовый дизайнер', education: 'Высшее', budget: '150–200 тыс. ₽/мес',
    about: 'Люблю горы, книги и длинные кухонные разговоры. Ищу человека для прогулок и смеха.',
    interests: ['walks', 'museums', 'books', 'coffee'], communication: ['chat', 'voice', 'meet'],
    values: ['goout', 'family'], meetingIntent: ['serious', 'acquaintance'], meetingPlaces: ['cafe', 'park'],
    income: '120000', area: '54', profession: 'Веб-дизайнер',
    likes: { relationship: ['отношения_навсегда', 'отношения_в_браке'], family: ['семья_дети', 'семья_с_родителями'] }
  },
  {
    name: 'Мария', gender: 'f', group: 'calm', age: 32, city: 'Moscow', zodiac: 'Скорпион',
    job: 'Врач-кардиолог', education: 'Высшее', budget: '200–250 тыс. ₽/мес',
    about: 'График сложный, но я компенсирую йогой и сериалами. Ценю прямоту и своё пространство.',
    interests: ['sport', 'books', 'food', 'night'], communication: ['chat', 'voice'],
    values: ['just', 'family'], meetingIntent: ['serious'], meetingPlaces: ['cafe', 'sport'],
    income: '200000', area: '78', profession: 'Врач',
    likes: { relationship: ['отношения_навсегда'], family: ['семья_дети'] }
  },
  {
    name: 'Ольга', gender: 'f', group: 'live', age: 26, city: 'Saint Petersburg', zodiac: 'Весы',
    job: 'Маркетолог', education: 'Высшее', budget: '100–150 тыс. ₽/мес',
    about: 'Обожаю театр, настолки и спонтанные поездки в выходные. Ищу компанию и лёгкость.',
    interests: ['theatre', 'boardgames', 'art', 'cinema'], communication: ['chat', 'meet', 'games'],
    values: ['goout', 'just'], meetingIntent: ['acquaintance', 'friend', 'hangout'], meetingPlaces: ['theatre', 'park', 'cafe'],
    income: '95000', area: '42', profession: 'Маркетолог',
    likes: { relationship: ['отношения_в_браке', 'свободные_отношения'], family: ['семья_с_родителями'] }
  },
  {
    name: 'Алексей', gender: 'm', group: 'warm', age: 31, city: 'Moscow', zodiac: 'Скорпион',
    job: 'Бэкенд-разработчик', education: 'Высшее', budget: '250–300 тыс. ₽/мес',
    about: 'Программирую, бегаю и варю кофе как ритуал. Ищу человека, с которым не нужно играть роли.',
    interests: ['sport', 'coffee', 'cinema', 'music'], communication: ['chat', 'voice', 'meet'],
    values: ['goout', 'family'], meetingIntent: ['serious', 'acquaintance'], meetingPlaces: ['cafe', 'sport'],
    income: '280000', area: '62', profession: 'Программист',
    likes: { relationship: ['отношения_навсегда', 'отношения_в_браке'], family: ['семья_дети'] }
  },
  {
    name: 'Дмитрий', gender: 'm', group: 'live', age: 27, city: 'Moscow', zodiac: 'Лев',
    job: 'Фитнес-тренер', education: 'Среднее', budget: '100–150 тыс. ₽/мес',
    about: 'Веду тренировки, люблю горы и большие компании. Открытый, но иду на всё ради своих людей.',
    interests: ['sport', 'food', 'night', 'music'], communication: ['chat', 'voice', 'video', 'meet'],
    values: ['goout', 'just'], meetingIntent: ['acquaintance', 'hangout', 'party'], meetingPlaces: ['sport', 'cafe', 'club'],
    income: '110000', area: '38', profession: 'Тренер',
    likes: { relationship: ['свободные_отношения', 'отношения_в_браке'], family: ['свободный_перед'] }
  },
  {
    name: 'Игорь', gender: 'm', group: 'calm', age: 38, city: 'Saint Petersburg', zodiac: 'Козерог',
    job: 'Архитектор', education: 'Высшее', budget: '200–250 тыс. ₽/мес',
    about: 'Проектирую дома, в выходные — велосипед и выставки. Спокойный, верный, немного занудный.',
    interests: ['art', 'museums', 'walks', 'coffee'], communication: ['chat', 'slow', 'meet'],
    values: ['family', 'online'], meetingIntent: ['serious', 'friend'], meetingPlaces: ['park', 'gallery', 'cafe'],
    income: '220000', area: '95', profession: 'Архитектор',
    likes: { relationship: ['отношения_в_браке'], family: ['семья_дети', 'семья_с_родителями'] }
  },
  {
    name: 'Екатерина', gender: 'f', group: 'calm', age: 30, city: 'Moscow', zodiac: 'Стрелец',
    job: 'HR-директор', education: 'Высшее', budget: '150–200 тыс. ₽/мес',
    about: 'Управляю командами в IT, но дома — кошки, книги и тихие пятницы. Ищу надёжного человека: близость важнее количества встреч, верность важнее обещаний. Не тороплю события, но когда решаюсь — вкладываюсь всерьёз. Без драйва мне скучно, без спокойствия — тревожно, идеально, когда есть и то, и другое.',
    interests: ['books', 'art', 'coffee', 'museums'], communication: ['chat', 'slow', 'meet'],
    values: ['family', 'goout'], meetingIntent: ['serious', 'acquaintance'], meetingPlaces: ['cafe', 'gallery', 'theatre'],
    income: '150000', area: '60', profession: 'HR-директор',
    likes: { relationship: ['отношения_навсегда', 'отношения_в_браке'], family: ['семья_дети', 'семья_с_родителями'] }
  },
  {
    name: 'Сергей', gender: 'm', group: 'warm', age: 33, city: 'Saint Petersburg', zodiac: 'Водолей',
    job: 'Инженер-проектировщик', education: 'Высшее', budget: '150–200 тыс. ₽/мес',
    about: 'Проектирую мосты в Петербурге, по выходным бегаю вдоль Невы и фотографирую закаты. Не ищу идеала — ищу рядом человека, с которым интересно молчать и интересно спорить. Из меня получается спокойный партнёр: готовим вместе, путешествуем недолго, но часто, и я всегда за честные разговоры.',
    interests: ['sport', 'walks', 'cinema', 'coffee'], communication: ['chat', 'voice', 'meet'],
    values: ['goout', 'just'], meetingIntent: ['acquaintance', 'friend', 'hangout'], meetingPlaces: ['sport', 'park', 'cinema'],
    income: '170000', area: '68', profession: 'Инженер',
    likes: { relationship: ['отношения_в_браке', 'свободные_отношения'], family: ['семья_с_родителями', 'свободный_перед'] }
  },
  {
    name: 'Наталья', gender: 'f', group: 'live', age: 24, city: 'Kazan', zodiac: 'Лев',
    job: 'SMM-специалист', education: 'Высшее', budget: '80–100 тыс. ₽/мес',
    about: 'Веду соцсети брендов, а сама — про живые эмоции: концерты, настолки с друзьями, спонтанные поездки. Умею зажечь вечер и собрать компанию. Ищу такого же лёгкого на подъём: посмеяться, обсудить всё на свете, сходить на рынок за фруктами в воскресенье. Драма — не мой жанр, зато юмор — мой.',
    interests: ['night', 'music', 'food', 'theatre', 'boardgames'], communication: ['chat', 'video', 'games'],
    values: ['just', 'goout'], meetingIntent: ['party', 'hangout', 'acquaintance'], meetingPlaces: ['club', 'cafe', 'theatre'],
    income: '75000', area: '30', profession: 'SMM-специалист',
    likes: { relationship: ['свободные_отношения', 'отношения_в_браке'], family: ['свободный_перед', 'семья_с_родителями'] }
  }
];

const PHOTO_POOL = [
  './assets/profile/avatar-4x5.jpg',
  './assets/profile/avatar-square.jpg',
  './assets/profile/photo-1024.jpg'
];

// Фиксированные аккаунты тестовых анкет: повторный запуск не плодит дубли.
// Это тестовые входы, не пользовательские данные — их можно свободно пересоздать.
const SEED_SLUG = {
  'Анна': 'anna', 'Мария': 'maria', 'Ольга': 'olga',
  'Алексей': 'alexey', 'Дмитрий': 'dmitry', 'Игорь': 'igor',
  'Екатерина': 'ekaterina', 'Сергей': 'sergey', 'Наталья': 'natalya'
};
const SEED_LOGIN = {};
for (const persona of PERSONAS) {
  SEED_LOGIN[persona.name] = { email: `seed.${SEED_SLUG[persona.name]}@example.com`, password: 'WalkDate2026!' };
}

function birthDateFor(age) {
  const today = new Date();
  const year = today.getFullYear() - age;
  const month = 1 + Math.floor(today.getMonth() / 2);
  const day = 5 + (Math.abs(hashSeed(`${age}-${month}`)) % 20);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pickAnswer(q, persona, rng) {
  const cityAnswer = CITY_KEY_TO_ANSWER[persona.city];

  if (q.id === 'q274') {
    return cityAnswer || 'e';
  }
  if (q.id === 'q258') {
    const entry = Object.entries(ZODIAC_ANSWER_TO_LABEL).find(([, label]) => label === persona.zodiac);
    if (entry) return entry[0];
  }
  if (q.id === 'q46') {
    const list = Array.isArray(q.searchList) ? q.searchList : Object.keys(q.searchMap || {});
    const wanted = String(persona.profession || '').toLowerCase();
    const hit = list.find((x) => String(x).toLowerCase().includes(wanted));
    if (hit) return `search:${hit}`;
    return `search:${list[Math.floor(rng() * list.length)]}`;
  }
  if (q.id === 'q21') return `custom:${persona.income}`;
  if (q.id === 'q22b') return `custom:${persona.area}`;

  const options = optionsFor(q, persona.gender);
  if (!options.length) return null;

  const wantedTraits = Object.entries(persona.likes || {}).map(([cat, vals]) => [cat, new Set(vals)]);

  const scored = options.map((opt) => {
    const value = String(opt.value || '');
    let score = rng() * 0.6;
    for (const [cat, vals] of wantedTraits) {
      const catValue = String(opt.traits?.[cat] || value);
      if (vals.has(catValue)) score += 2.5;
      else if (value && catValue === value) score += 0.2;
    }
    return { opt, score };
  });
  scored.sort((a, b) => b.score - a.score);

  if (q.multi) {
    const count = Math.min(scored.length, 2 + (rng() < 0.5 ? 1 : 0));
    const ids = scored.slice(0, count).map((x) => x.opt.id);
    return [...new Set(ids)].sort().join(',');
  }
  return scored[0].opt.id;
}

// Люди одного архетипа отвечают почти одинаково, разные архетипы — по-разному.
// Так процент совместимости в ленте становится информативным.
function buildAnswers(persona) {
  const answers = {};
  for (const q of ALL_QUESTIONS) {
    const groupRng = mulberry32(hashSeed(`group:${persona.group}:${q.id}`));
    // ~18% вопросов человек отвечает по-своему — чтобы анкеты не были клонами.
    const isPersonal = groupRng() < 0.18;
    const seedSource = isPersonal ? `${persona.name}:${q.id}` : `group:${persona.group}:${q.id}`;
    const rng = mulberry32(hashSeed(seedSource));
    const answer = pickAnswer(q, persona, rng);
    if (answer != null) answers[q.id] = answer;
  }
  return answers;
}

function optionTraits(q, opt) {
  if (opt.traits) return opt.traits;
  if (q.category) return { [q.category]: opt.value };
  return {};
}

function numericBucket(q, value) {
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const steps = Array.isArray(q.numeric) && q.numeric.length ? q.numeric : null;
  if (!steps) return null;
  let bucket = steps[steps.length - 1].value;
  for (const s of steps) {
    if (n <= s.min) {
      bucket = s.value;
      break;
    }
  }
  return bucket;
}

function buildPortrait(answers, persona) {
  const buckets = {};
  let answered = 0;
  for (const q of ALL_QUESTIONS) {
    const answerId = answers[q.id];
    if (!answerId) continue;
    const num = answerId.startsWith('custom:') ? answerId.slice(7) : null;
    const searched = answerId.startsWith('search:') ? answerId.slice(7) : null;
    let traitsList;
    if (num != null) {
      const bucket = numericBucket(q, num);
      traitsList = bucket && q.category ? [{ [q.category]: bucket }] : [];
    } else if (searched != null) {
      const cat = (q.searchMap || {})[searched] || '';
      traitsList = cat && q.category ? [{ [q.category]: cat }] : [];
    } else {
      traitsList = answerId
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((oid) => {
          const opt = optionsFor(q, persona.gender).find((x) => x.id === oid);
          return opt ? optionTraits(q, opt) : null;
        })
        .filter(Boolean);
    }
    if (!traitsList.length) continue;
    answered += 1;
    for (const traits of traitsList) {
      for (const [dim, val] of Object.entries(traits)) {
        if (!buckets[dim]) buckets[dim] = {};
        buckets[dim][val] = (buckets[dim][val] || 0) + 1;
      }
    }
  }
  const summary = {};
  for (const [dim, bucket] of Object.entries(buckets)) {
    let best = '';
    let bestCount = -1;
    for (const [key, count] of Object.entries(bucket)) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    summary[dim] = best;
  }
  const categories = {};
  for (const q of ALL_QUESTIONS) {
    if (!q.category) continue;
    categories[q.category] = categories[q.category] || { answered: 0, total: 0 };
    categories[q.category].total += 1;
    if (answers[q.id]) categories[q.category].answered += 1;
  }
  return { answered, total: ALL_QUESTIONS.length, summary, labels: [], categories };
}

function buildProfile(persona) {
  const answers = buildAnswers(persona);
  const portrait = buildPortrait(answers, persona);
  const birthDate = birthDateFor(persona.age);
  const photos = [PHOTO_POOL[hashSeed(persona.name) % PHOTO_POOL.length]];
  const second = PHOTO_POOL[(hashSeed(persona.name) + 1) % PHOTO_POOL.length];
  if (second !== photos[0]) photos.push(second);

  return {
    id: crypto.randomUUID(),
    name: persona.name,
    gender: persona.gender === 'f' ? 'female' : 'male',
    age: persona.age,
    birthDate,
    ageConfirmed: true,
    city: persona.city,
    cityOverride: persona.city,
    stepCount: 1000 + (hashSeed(persona.name) % 4000),
    meetingIntent: persona.meetingIntent,
    meetingPlaces: persona.meetingPlaces,
    photos,
    interests: persona.interests,
    communication: persona.communication,
    values: persona.values,
    zodiac: persona.zodiac,
    jobTitle: persona.job,
    education: persona.education,
    budget: persona.budget,
    about: persona.about,
    questionnaireAnswers: answers,
    portrait,
    // Разбивка как в buildProfileTree() в app.js: вопросы с категорией → factual, без → persona.
    persona: splitTreeByCategory(answers, portrait.summary, persona.gender, false),
    factual: splitTreeByCategory(answers, portrait.summary, persona.gender, true)
  };
}

function splitTreeByCategory(answers, summary, gender, wantCategorized) {
  const out = {};
  for (const q of ALL_QUESTIONS) {
    const answerId = answers[q.id];
    if (!answerId) continue;
    if (!!q.category !== wantCategorized) continue;
    const traits = optionTraitsForAnswer(q, answerId, gender);
    for (const [dim, val] of Object.entries(traits)) {
      if (!summary || summary[dim] === val) out[dim] = val;
    }
  }
  return out;
}

function optionTraitsForAnswer(q, answerId, gender) {
  const num = answerId.startsWith('custom:') ? answerId.slice(7) : null;
  const searched = answerId.startsWith('search:') ? answerId.slice(7) : null;
  if (num != null) {
    const bucket = numericBucket(q, num);
    return bucket && q.category ? { [q.category]: bucket } : {};
  }
  if (searched != null) {
    const cat = (q.searchMap || {})[searched] || '';
    return cat && q.category ? { [q.category]: cat } : {};
  }
  const traits = {};
  for (const oid of answerId.split(',').map((s) => s.trim()).filter(Boolean)) {
    const opt = optionsFor(q, gender).find((x) => x.id === oid);
    if (opt) Object.assign(traits, optionTraits(q, opt));
  }
  return traits;
}

// Та же логика, что в countQuestionnaireMatches() в app.js — для проверки анкет.
function countMatches(userAnswers, candidate) {
  let total = 0;
  let matched = 0;
  for (const q of ALL_QUESTIONS) {
    const my = userAnswers[q.id];
    const their = candidate.questionnaireAnswers[q.id];
    if (!my || !their) continue;
    const myNum = numericAnswerValue(my);
    if (myNum != null) {
      const theirNum = numericAnswerValue(their);
      if (theirNum == null) continue;
      total += 1;
      if (numericBucket(q, myNum) === numericBucket(q, theirNum)) matched += 1;
      continue;
    }
    const mySearch = searchAnswerValue(my);
    if (mySearch != null) {
      const theirSearch = searchAnswerValue(their);
      if (theirSearch == null) continue;
      total += 1;
      const myCat = (q.searchMap || {})[mySearch];
      const theirCat = (q.searchMap || {})[theirSearch];
      if (myCat && myCat === theirCat) matched += 1;
      continue;
    }
    const mine = q.multi ? my.split(',').map((x) => x.trim()).filter(Boolean) : [my];
    const theirs = q.multi ? their.split(',').map((x) => x.trim()).filter(Boolean) : [their];
    total += 1;
    if (mine.some((x) => theirs.includes(x))) matched += 1;
  }
  return { total, matched };
}

function numericAnswerValue(answerId) {
  return String(answerId || '').startsWith('custom:') ? String(answerId).slice(7) : null;
}

function searchAnswerValue(answerId) {
  return String(answerId || '').startsWith('search:') ? String(answerId).slice(7) : null;
}

const profiles = PERSONAS.map(buildProfile);

function validate() {
  const appForRefs = appSrc;
  const refArray = (name) => {
    const i = appForRefs.indexOf(`const ${name} = [`);
    if (i < 0) return [];
    const start = appForRefs.indexOf('[', i);
    let depth = 0;
    for (let j = start; j < appForRefs.length; j += 1) {
      if (appForRefs[j] === '[') depth += 1;
      else if (appForRefs[j] === ']') {
        depth -= 1;
        if (depth === 0) return Function(`"use strict";return (${appForRefs.slice(start, j + 1)});`)();
      }
    }
    return [];
  };
  const dict = {
    meetingPlaces: new Set(refArray('MEETING_PLACES').map((x) => x.id)),
    meetingIntent: new Set(refArray('MEETING_INTENTS').map((x) => x.id)),
    communication: new Set(refArray('COMM_FORMATS').map((x) => x.id)),
    values: new Set(refArray('VALUES').map((x) => x.id)),
    interests: new Set(['coffee', 'walks', 'museums', 'cinema', 'music', 'food', 'sport', 'theatre', 'boardgames', 'art', 'books', 'night'])
  };
  const problems = [];
  for (const p of profiles) {
    for (const field of Object.keys(dict)) {
      for (const value of p[field] || []) {
        if (!dict[field].has(value)) problems.push(`${p.name}.${field}: нет такого id "${value}"`);
      }
    }
    const answered = Object.keys(p.questionnaireAnswers).length;
    if (answered !== ALL_QUESTIONS.length) problems.push(`${p.name}: ответов ${answered} из ${ALL_QUESTIONS.length}`);
    if (!p.birthDate) problems.push(`${p.name}: нет birthDate`);
    if (!p.photos.length) problems.push(`${p.name}: нет фото`);
  }
  if (problems.length) {
    console.error('Ошибки валидации:');
    for (const p of problems) console.error(' - ' + p);
    process.exit(1);
  }
  console.log(`Валидация пройдена: ${profiles.length} анкет, по ${ALL_QUESTIONS.length} ответов.`);
}

validate();

const mode = process.argv.includes('--print') ? 'print' : 'push';
const refresh = process.argv.includes('--refresh');
const onlyIdx = process.argv.indexOf('--only');
const onlyName = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

if (mode === 'print') {
  for (const p of profiles) {
    if (onlyName && p.name !== onlyName) continue;
    const persona = PERSONAS.find((x) => x.name === p.name);
    const answered = Object.keys(p.questionnaireAnswers).length;
    console.log(`${p.name} (${p.gender}, ${p.age}, ${CITY_NAME[p.city]}, архетип ${persona.group}) — ответов ${answered}/${ALL_QUESTIONS.length}, зодиак ${p.zodiac}, профессия ${p.jobTitle}`);
  }
  console.log('\nМатч между анкетами (совпавшие ответы / всего):');
  const header = profiles.map((p) => p.name.padStart(9)).join(' ');
  console.log(''.padEnd(10) + header);
  for (const a of profiles) {
    const cells = [a.name.padEnd(9)];
    for (const b of profiles) {
      if (a === b) {
        cells.push('    —    ');
        continue;
      }
      const { total, matched } = countMatches(a.questionnaireAnswers, b);
      cells.push(`${String(Math.round((matched / total) * 100)).padStart(3)}%`.padStart(9));
    }
    console.log(cells.join(' '));
  }
} else {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../supabase-config.js');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase не настроен');

  const anon = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };

  // Уже засеянные анкеты не дублируем. Сразу выбираем только нужные поля
  // (ответы целиком не тащим — payload со 282 ответами на всех медленный).
  const existingRes = await withRetry(
    () => fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,payload->profile->name,payload->profile->questionnaireAnswers`,
      { headers: anon, signal: AbortSignal.timeout(45000) }
    )
  );
  const existing = (await existingRes.json()) || [];
  const seededRows = existing.filter((r) => {
    const answers = r.questionnaireAnswers;
    return answers && typeof answers === 'object' && Object.keys(answers).length >= ALL_QUESTIONS.length;
  });
  const seededNames = new Set(seededRows.map((r) => r.name).filter(Boolean));

  const byName = {};
  for (const row of seededRows) {
    const name = row.name;
    if (!name) continue;
    byName[name] = byName[name] || [];
    byName[name].push(row.id);
  }
  const duplicates = Object.entries(byName).filter(([, ids]) => ids.length > 1);
  if (duplicates.length && !refresh) {
    console.error('В базе есть дубли анкет — обновлять нельзя, пока их не удалить:');
    for (const [name, ids] of duplicates) console.error(`  ${name}: ${ids.join(', ')}`);
    console.error('\nУдалите лишние строки в Supabase Dashboard → SQL Editor:');
    console.error(`delete from profiles where id in (\n  ${duplicates.flatMap(([, ids]) => ids.slice(1)).map((id) => `'${id}'::uuid`).join(',\n  ')}\n);`);
    process.exit(1);
  }
  // При --refresh мы пишем по id аккаунта из SEED_LOGIN, поэтому чужие дубли не трогаем.
  if (duplicates.length) console.warn('Дубли анкет останутся как есть (при --refresh обновляем только свои аккаунты):');
  if (duplicates.length) for (const [name, ids] of duplicates) console.warn(`  ${name}: ${ids.length} шт.`);
  if (seededNames.size) console.log(`Уже в базе: ${[...seededNames].join(', ')}${refresh ? ' (обновляем)' : ' — пропускаем'}`);

  const credentials = [];
  for (const p of profiles) {
    if (onlyName && p.name !== onlyName) continue;
    if (seededNames.has(p.name) && !refresh) {
      console.log(`SKIP ${p.name} — анкета уже есть в базе`);
      continue;
    }
    const email = SEED_LOGIN[p.name].email;
    const password = SEED_LOGIN[p.name].password;

    // Аккаунт мог остаться с прошлого прогона — пробуем войти, иначе регистрируем.
    let token = null;
    let userId = null;
    const signInRes = await withRetry(() => fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: anon,
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20000)
    }));
    const signInBody = await signInRes.json();
    if (signInRes.ok && signInBody?.access_token) {
      token = signInBody.access_token;
      userId = signInBody.user?.id;
      console.log(`     ${p.name}: вход в существующий аккаунт`);
    } else {
      const signUpRes = await withRetry(() => fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: anon,
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(20000)
      }));
      const signUpBody = await signUpRes.json();
      token = signUpBody?.access_token;
      userId = signUpBody?.user?.id || signUpBody?.id;
    }
    if (!token || !userId) {
      console.log(`ERR  ${p.name}: не удалось получить токен`);
      continue;
    }

    const authHeaders = { ...anon, Authorization: `Bearer ${token}` };
    p.id = userId;
    const res = await withRetry(() => fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: userId, payload: { profile: p }, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(20000)
    }));
    const text = await res.text();
    const ok = res.ok;
    console.log(`${ok ? 'OK ' : 'ERR'} ${p.name} ${userId} статус ${res.status} ${ok ? '' : text.slice(0, 200)}`);
    if (ok) credentials.push({ name: p.name, id: userId, ...SEED_LOGIN[p.name] });
  }

  console.log('\n=== Доступы тестовых анкет ===');
  for (const c of credentials) console.log(`${c.name}\t${c.email}\t${c.password}`);
}

// Сеть до Supabase периодически отваливается по таймауту — повторяем попытку.
async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fn();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      console.log(`  ... сбой (${err.message}), попытка ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}