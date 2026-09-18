import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.SECRET || 'vercel-dev-secret-change-me';
const MOSCOW_AFFIS_URL = process.env.MOSCOW_AFFIS_URL || 'https://transport.mos.ru/events';
const REFRESH_TTL_MS = 1000 * 60 * 60 * 6;

const store = (globalThis.__walkdateVercelStore ||= {
  users: {},
  seedEvents: [
    {
      id: 'msk-park-walk',
      city: 'Moscow',
      title: 'Прогулка в парке + кофе',
      place: 'Парк рядом с центром',
      lat: 55.751244,
      lon: 37.618423,
      tags: ['walks', 'coffee'],
      startsAt: '2026-05-16T18:30:00+03:00'
    },
    {
      id: 'msk-museum-night',
      city: 'Moscow',
      title: 'Вечер в музее',
      place: 'Музей (выберите любимый)',
      lat: 55.758,
      lon: 37.617,
      tags: ['museums', 'art'],
      startsAt: '2026-05-18T19:00:00+03:00'
    },
    {
      id: 'spb-walk',
      city: 'Saint Petersburg',
      title: 'Прогулка у воды',
      place: 'Набережная',
      lat: 59.9386,
      lon: 30.3141,
      tags: ['walks'],
      startsAt: '2026-05-17T18:00:00+03:00'
    }
  ],
  remoteEvents: [],
  remoteEventsUpdatedAt: 0,
  venueCatalog: [
    {
      id: 'msk-rest-italia',
      city: 'Moscow',
      kind: 'food',
      title: 'Ресторан итальянской кухни «Trattoria»',
      address: 'ул. Тверская, 12',
      lat: 55.7612,
      lon: 37.6034,
      tags: ['food', 'night'],
      priceFrom: 1500,
      durationMin: 120,
      openHours: '12:00–23:00',
      imageEmoji: '🍝'
    },
    {
      id: 'msk-coffee-loft',
      city: 'Moscow',
      kind: 'coffee',
      title: 'Кофейня Loft Coffee',
      address: 'ул. Арбат, 24',
      lat: 55.7487,
      lon: 37.5902,
      tags: ['coffee', 'walks', 'art'],
      priceFrom: 350,
      durationMin: 60,
      openHours: '08:00–22:00',
      imageEmoji: '☕'
    },
    {
      id: 'msk-cinema-okto',
      city: 'Moscow',
      kind: 'cinema',
      title: 'Кинотеатр «Октябрь»',
      address: 'ул. Новый Арбат, 24',
      lat: 55.7519,
      lon: 37.5835,
      tags: ['cinema'],
      priceFrom: 500,
      durationMin: 150,
      openHours: '10:00–01:00',
      imageEmoji: '🎬'
    },
    {
      id: 'msk-spa-eaze',
      city: 'Moscow',
      kind: 'spa',
      title: 'Массажный салон Eaze SPA',
      address: 'Пятницкая ул., 8',
      lat: 55.7436,
      lon: 37.6259,
      tags: ['spa', 'health'],
      priceFrom: 1800,
      durationMin: 90,
      openHours: '10:00–22:00',
      imageEmoji: '💆'
    },
    {
      id: 'msk-gym-river',
      city: 'Moscow',
      kind: 'sport',
      title: 'Спортзал River Fitness',
      address: 'наб. Тараса Шевченко, 23',
      lat: 55.7501,
      lon: 37.5572,
      tags: ['sport'],
      priceFrom: 600,
      durationMin: 90,
      openHours: '07:00–23:00',
      imageEmoji: '🏋️'
    },
    {
      id: 'msk-park-gorky',
      city: 'Moscow',
      kind: 'walks',
      title: 'Парк Горького — велопрогулка на двоих',
      address: 'ул. Крымский Вал, 9',
      lat: 55.7295,
      lon: 37.6031,
      tags: ['walks', 'sport'],
      priceFrom: 400,
      durationMin: 120,
      openHours: 'Круглосуточно',
      imageEmoji: '🚴'
    },
    {
      id: 'msk-muse-pushkin',
      city: 'Moscow',
      kind: 'museums',
      title: 'ГМИИ им. Пушкина — экскурсия для двоих',
      address: 'ул. Волхонка, 12',
      lat: 55.7447,
      lon: 37.6056,
      tags: ['museums', 'art'],
      priceFrom: 600,
      durationMin: 120,
      openHours: '11:00–20:00',
      imageEmoji: '🖼️'
    },
    {
      id: 'msk-quest-mirror',
      city: 'Moscow',
      kind: 'games',
      title: 'Квест «Зеркальный лабиринт» на двоих',
      address: 'ул. Большая Полянка, 7',
      lat: 55.7374,
      lon: 37.6171,
      tags: ['games', 'boardgames'],
      priceFrom: 1000,
      durationMin: 90,
      openHours: '10:00–23:00',
      imageEmoji: '🗝️'
    },
    {
      id: 'msk-teatro',
      city: 'Moscow',
      kind: 'art',
      title: 'Современный театр «Другой»',
      address: 'Чистопрудный б-р, 12',
      lat: 55.763,
      lon: 37.6416,
      tags: ['theatre', 'art'],
      priceFrom: 800,
      durationMin: 150,
      openHours: 'Спектакли: 19:00',
      imageEmoji: '🎭'
    },
    {
      id: 'msk-jazz-club',
      city: 'Moscow',
      kind: 'night',
      title: 'Джаз-клуб Night Flames',
      address: 'ул. Мясницкая, 15',
      lat: 55.7626,
      lon: 37.6341,
      tags: ['night', 'music'],
      priceFrom: 700,
      durationMin: 180,
      openHours: '19:00–02:00',
      imageEmoji: '🎷'
    },
    {
      id: 'spb-rest-neva',
      city: 'Saint Petersburg',
      kind: 'food',
      title: 'Панорамный ресторан «Нева»',
      address: 'Английская наб., 56',
      lat: 59.9408,
      lon: 30.288,
      tags: ['food', 'night'],
      priceFrom: 1800,
      durationMin: 120,
      openHours: '12:00–01:00',
      imageEmoji: '🍷'
    },
    {
      id: 'spb-spa-royal',
      city: 'Saint Petersburg',
      kind: 'spa',
      title: 'СПА-комплекс «Петровский» для пары',
      address: 'Петровская наб., 6',
      lat: 59.9559,
      lon: 30.3353,
      tags: ['spa', 'health'],
      priceFrom: 2200,
      durationMin: 120,
      openHours: '09:00–23:00',
      imageEmoji: '♨️'
    },
    {
      id: 'spb-cinema-auth',
      city: 'Saint Petersburg',
      kind: 'cinema',
      title: 'Кинотеатр «Аврора»',
      address: 'Невский пр., 60',
      lat: 59.9331,
      lon: 30.3381,
      tags: ['cinema'],
      priceFrom: 450,
      durationMin: 150,
      openHours: '10:00–02:00',
      imageEmoji: '🎥'
    },
    {
      id: 'spb-gym-nevsky',
      city: 'Saint Petersburg',
      kind: 'sport',
      title: 'Фитнес-клуб Nevsky Fitness',
      address: 'Невский пр., 120',
      lat: 59.9287,
      lon: 30.3712,
      tags: ['sport'],
      priceFrom: 550,
      durationMin: 90,
      openHours: '07:00–23:00',
      imageEmoji: '🏃'
    },
    {
      id: 'spb-park-pmg',
      city: 'Saint Petersburg',
      kind: 'walks',
      title: 'Летний сад — прогулка с гидом',
      address: 'Летний сад',
      lat: 59.9432,
      lon: 30.3323,
      tags: ['walks', 'art'],
      priceFrom: 0,
      durationMin: 60,
      openHours: '10:00–22:00',
      imageEmoji: '🌳'
    },
    {
      id: 'kzn-rest-tatar',
      city: 'Kazan',
      kind: 'food',
      title: 'Ресторан татарской кухни «Тюбетей»',
      address: 'ул. Баумана, 8',
      lat: 55.7903,
      lon: 49.1182,
      tags: ['food'],
      priceFrom: 900,
      durationMin: 90,
      openHours: '11:00–23:00',
      imageEmoji: '🍲'
    },
    {
      id: 'kzn-spa-kazan',
      city: 'Kazan',
      kind: 'spa',
      title: 'Хамам и СПА «Казанские мотивы»',
      address: 'ул. Пушкина, 18',
      lat: 55.7861,
      lon: 49.1237,
      tags: ['spa', 'health'],
      priceFrom: 1500,
      durationMin: 120,
      openHours: '10:00–22:00',
      imageEmoji: '🛁'
    },
    {
      id: 'kzn-cinema-mir',
      city: 'Kazan',
      kind: 'cinema',
      title: 'Кинотеатр «Мир»',
      address: 'ул. Астрономическая, 14',
      lat: 55.7923,
      lon: 49.1131,
      tags: ['cinema'],
      priceFrom: 400,
      durationMin: 150,
      openHours: '10:00–01:00',
      imageEmoji: '🎞️'
    },
    {
      id: 'kzn-gym-akts',
      city: 'Kazan',
      kind: 'sport',
      title: 'Спортзал АК БАРС Арена',
      address: 'пр. Хусаина Ямашева, 115',
      lat: 55.8214,
      lon: 49.1606,
      tags: ['sport'],
      priceFrom: 500,
      durationMin: 90,
      openHours: '07:00–00:00',
      imageEmoji: '⛹️'
    },
    {
      id: 'nsk-rest-sibir',
      city: 'Novosibirsk',
      kind: 'food',
      title: 'Ресторан сибирской кухни «Тайга»',
      address: 'Красный пр., 29',
      lat: 55.0349,
      lon: 82.9198,
      tags: ['food'],
      priceFrom: 1100,
      durationMin: 120,
      openHours: '12:00–00:00',
      imageEmoji: '🥩'
    },
    {
      id: 'nsk-spa-termal',
      city: 'Novosibirsk',
      kind: 'spa',
      title: 'Термальный комплекс «Сибирь»',
      address: 'ул. Кирова, 10',
      lat: 55.039,
      lon: 82.9226,
      tags: ['spa', 'health'],
      priceFrom: 1200,
      durationMin: 180,
      openHours: '09:00–23:00',
      imageEmoji: '🧖'
    },
    {
      id: 'nsk-gym-ocean',
      city: 'Novosibirsk',
      kind: 'sport',
      title: 'Фитнес-клуб Ocean Fitness',
      address: 'ул. Вокзальная магистраль, 16',
      lat: 55.0309,
      lon: 82.912,
      tags: ['sport'],
      priceFrom: 450,
      durationMin: 90,
      openHours: '06:00–23:00',
      imageEmoji: '🏊'
    },
    {
      id: 'nsk-cinema-basket',
      city: 'Novosibirsk',
      kind: 'cinema',
      title: 'Кинотеатр «Победа»',
      address: 'ул. Ленина, 7',
      lat: 55.0301,
      lon: 82.9207,
      tags: ['cinema'],
      priceFrom: 420,
      durationMin: 150,
      openHours: '10:00–01:00',
      imageEmoji: '🍿'
    }
  ],
  bookings: [],
  offers: []
});

function nowIso() {
  return new Date().toISOString();
}

function addWorkdays(start, n) {
  let d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function b64decode(str) {
  const pad = '='.repeat((4 - (String(str).length % 4)) % 4);
  const s = String(str).replaceAll('-', '+').replaceAll('_', '/') + pad;
  return Buffer.from(s, 'base64');
}

function signToken(payloadObj) {
  const payload = base64url(Buffer.from(JSON.stringify(payloadObj)));
  const sig = base64url(createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = base64url(createHmac('sha256', SECRET).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64decode(payload).toString('utf8'));
    if (!obj?.sub || !obj?.exp) return null;
    if (Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, saltB64) {
  const salt = saltB64 ? Buffer.from(saltB64, 'base64') : randomBytes(16);
  const hash = scryptSync(String(password || ''), salt, 32);
  return { saltB64: salt.toString('base64'), hashB64: hash.toString('base64') };
}

function passwordMatches(password, saltB64, hashB64) {
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(String(password || ''), salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
}

function sendJson(res, status, obj, extraHeaders = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders })) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(obj));
}

const PROFANITY_WORDS = ['хуй','хуи','пизд','бля','бляд','блять','ебат','ёб','еба','сука','сук','нахуй','нахер','пидор','пидар','говно','дерьмо','жопа','гондон','уёб','уеб','мудак','козёл'];
const EXTREMISM_WORDS = ['хайль','фашист','нацист','нацизм','нацик','свастик','арийск','гитлер','призываю к экстремизму','призыв к экстремизму','экстремистскую деятельность','оправдываю экстремизм','уничтожим иноземцев'];
const HATE_WORDS = ['хачи','хач','жиды','жид','чурок','чурк','чучмеки','чучмек','черножоп','понаех','вон из города'];
const RELIGIOUS_INSULT_WORDS = ['оскорбл','богохул','богохульств','богоубийц','святотатств','кощунств'];
const TERRORISM_WORDS = ['террори','джихад','смертник','взрывать','захват заложник','исламское государство','игил','даиш','халифат','оправдани терроризм'];
const SEPARATISM_WORDS = ['сепарати','отделени кавказ','отделени сибир','отделени кра','отделени республ','отделение кавказ','отделения кавказ','отделение кра','отделения кра','отделение республ','независимости кавказ','независимость кавказ','независимости сибир','независимость сибир','независимости чечн','независимы кавказ','независимы сибир','отделен от росси','отделение от росси'];
const DRUG_WORDS = ['наркотик','наркоту','наркота','марихуан','гашиш','кокаин','кокс','травк','амфетамин','метамфетамин','героин','фентанил','спайс','экстази','мефедрон','крэк','трамадол','кодеин','метадон','соль для ванн','склоняю к наркотикам','давай покурим'];
const CP_WORDS = ['child porn','детское порно','child sex','педофил','child abuse','непристойные действия','ср материалы','малолетк','несовершеннолетн для интим','несовершеннолетнюю для интим','несовершеннолетней для интим'];
const SUICIDE_WORDS = ['удавис','повесся','повесис','повешусь','покончу с собой','поконч с собой','покончить с собой','покончил с собой','покончила с собой','покончу с жизнью','покончить с жизнью','покончил с жизнью','убей себя','убить себя','сделай это с собой','сделай с собой это','реж вены','вскрою вены','перережу вены','сведу счёты с жизнью','свести счёты с жизнью','шагну с крыши','выпрыгну из окна','кинусь под','отравится таблетк','отравиться таблет','уничтожь себя'];
const COERCION_WORDS = ['заставлю тебя переспать','заставлю тебя со мной','понужд к сексу','развратн действие','развратн действий','развратн действи','принужд к сексу','не по своему желанию секс','изнасилую'];
const MINOR_SEX_WORDS = ['пересплю с','встречусь с летней','встречусь с леткой','с 15-летней','с 14-леткой','с 16-летн','с 13-летн','с 17-летн','с пятнадцатилетн','с четырнадцатилетн','с шестнадцатилетн','с тринадцатилетн'];
const PROSTITUTION_WORDS = ['сниму проститутк','снять проститутк','проститутк','путан','шлюх','эскорт','интим за ','секс за деньги','за деньги сниму'];
const NSFW_WORDS = [
  // === Порнография и площадки ===
  'порно','порнх','porn','porno','xxx','ххх','тройство','вагина','вагин','вульв','penis','pussy','dick','cock','ass','fuck','fucking','сайт порно','порно са','порносайт','порнух','порнограф','pornhub','xnxx','xvideo','эротик','эротич','еротик','эротк',
  // === Вульгарные обозначения половых органов и тела ===
  'писюн','писюх','песька','вагин','клитор','клitor','клитty','половой орган','полов орган','мужское достоинств','мужской половой','сиськ','сисек','сиськи','титьк','титк','сосок','соски','сосочк','грудь голая','голая грудь','задниц','ягодиц',
  // === Вульгарные сексуальные действия ===
  'отсос','отсас','отсоси','минет','минетт','минтить','куни','кунил','кyни','дроч','мастурб','онанизм','игрушки для секса','секс игрушк','щет мастурб','секс для друг','разврат','развратн','порно видео','секс видео','сексуальный контент','половой акт','совокуплен','заняться сексом','занялись сексом',
  // === Продажа интим-услуг ===
  'интим услу','интим предлож','интим в подарок','массаж с продолжением','массаж продолжение','эротический массаж','эротич массаж','вип эскорт','vip эскорт','эскорт услуги','эскорт услуг','снять девушку на ночь','сниму девушк на ночь','ночь за ','за ночь с','работаю за ','работа за ','девушк за деньги','парн за деньги','свидание за деньги','спутниц','спутницу','сопровождени','досуг для почтенн','досуг почтенн','интим досуг','интимный досуг','интимного досуга','интимн досуг','мальчик по вызову','девочка по вызову','девушка по вызову','мужчина по вызову','вызвать проститу','вызывать проститутку',
  // === Другое явно непристойное ===
  'грязн чаты','взросл контент','взрослый контент','adult content','sex камера','вебкам','webcam модель','контент для взрослых','свот снимок','интимн снимок','обнаж тела','обнаженн','обнажённ','голое тело','голые фото','фото голой','фото голый','нюдс','нюдсы','nude','naked','ню фото','интим фото','фото интим','видео интим'
];
const FOREIGN_AGENT_WORDS = ['иностранный агент','иностранного агента','иностранному агенту','иностранным агентом','иностранные агенты','иностранных агентов','иностранными агентами','иностранном агенте','иностранных агентах','иностраных агент','иностраный агент','иностраного агента','иностраная агитаци','иностраного агентства','иноагент','иноагента','иноагенты','иноагентов','иностранное влияние','иностранного влияния','иностранным влиянием','foreign agent','foreign agents'];
const EXTREMIST_MATERIAL_WORDS = ['экстремистск','запрещённая информация','единый реестр запрещён'];
const UNREST_WORDS = [
  // ст. 212 УК: массовые беспорядки / призывы к незаконным массовым мероприятиям (RU)
  'призыв к переворот','призываю к переворот','устроим переворот','государственн переворот','свержен власти','свергни власть','свергнем власть','свержение правительств',
  'устроим бунт','организуем бунт','призыв к бунт','призываю к бунт','устроим мятеж','организуем мятеж','вооруженный мятеж','вооружённый мятеж',
  'массов беспорядк','массовые беспорядки','устроим беспорядки','призыв к заворушен','заворушен',
  'захват власти','захватим власть','штурм кремл','штурм правительствен','штурмовать здание','идти на штурм органов',
  'устроим погром','организуем погром','погром магазин','агитируй за бунт','выйдем на улицы и перекро'
];
const QUEERWORDS_ROOT = 'лгбт';  // якорь для связанных групп (см. containsLgbtPropaganda)

const LAT_TO_CYR = { 'a':'а','e':'е','o':'о','p':'р','c':'с','x':'х','y':'у','h':'н','k':'к','m':'м','t':'т','b':'в' };
const CYR_TO_LAT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'j','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
const BRUSH_CHARS = new Set(['.', ',', ' ', '-', '_', '*', '!', '?', '@', '#', '$', '%', '^', '&', '(', ')', '+', '=', '/', '\\', '|', ':', ';', '"', "'", '<', '>', '~', '`', '№']);
function stripBrush(s) { return String(s || '').split('').filter((c) => !BRUSH_CHARS.has(c)).join(''); }

function normalizeForMatch(text) {
  let out = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/ъ/g, '');
  out = out.split('').map((c) => LAT_TO_CYR[c] ?? c).join('');
  return out;
}

function translitOf(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').split('').map((c) => CYR_TO_LAT[c] ?? c).join('');
}

// Диакритика latin-языков (немецкий, французский, испанский и т.п.) → базовые буквы,
// чтобы «Gotteslästerung», «blasphème», «esvástica» матчились как latin-фразы.
const ACCENT_MAP = { 'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a','ą':'a','é':'e','è':'e','ê':'e','ë':'e','ę':'e','í':'i','ì':'i','î':'i','ï':'i','ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ú':'u','ù':'u','û':'u','ü':'u','ñ':'n','ç':'c','ć':'c','š':'s','ž':'z','ß':'ss' };
function latinOf(text) {
  return String(text || '').toLowerCase().split('').map((c) => ACCENT_MAP[c] ?? c).join('')
    .replace(/ё/g, 'e').split('').map((c) => CYR_TO_LAT[c] ?? c).join('')
    .replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Поиск целых latin-слов/фраз (multi-word ок) с границами слов — защита от ложных
// срабатываний типа «analysis → anal», «grape → rape», «specific → spic».
function containsLatinPhrases(text, phrases) {
  const t = ` ${latinOf(text)} `;
  return phrases.some((p) => t.includes(` ${p.toLowerCase()} `));
}
// Стем-поиск по началу токена ТОЛЬКО для длинных/однозначных корней (>=5 букв):
// «swastik*», «porn*» безопасны, а короткие («anal», «spic», «meth») — нет,
// т.к. дают «analysis», «spice», «method».
function containsLatinStems(text, stems) {
  const tokens = latinOf(text).split(/\s+/);
  return stems.some((st) => tokens.some((t) => t.length >= st.length && t.startsWith(st)));
}

function containsProfanity(text) {
  const lower = normalizeForMatch(text);
  for (const word of PROFANITY_WORDS) {
    if (!word) continue;
    if (lower.includes(word.toLowerCase())) return true;
  }
  // Ё/Е нормализация: 'ёб' → 'еб' ловится только как отдельное слово (не "небо"/"хлеб").
  if (/(^|[^а-яё0-9_])еб([^а-яё0-9_]|$)/.test(lower.replace(/[^а-яё0-9_]/g, ' '))) return true;
  const brushed = stripBrush(text.toLowerCase());
  if (translitOf(brushed).includes('hui')) return true;
  if (translitOf(brushed).includes('blyat')) return true;
  if (translitOf(brushed).includes('blya')) return true;
  if (translitOf(brushed).includes('suka')) return true;
  if (translitOf(brushed).includes('ebat')) return true;
  if (translitOf(brushed).includes('yob')) return true;
  if (translitOf(brushed).includes('pidor')) return true;
  if (translitOf(brushed).includes('govno')) return true;
  return false;
}

function containsExtremism(text) {
  const lower = normalizeForMatch(text);
  for (const word of EXTREMISM_WORDS) {
    if (lower.includes(word)) return true;
  }
  if (translitOf(text.toLowerCase()).includes('nazi')) return true;
  if (translitOf(text.toLowerCase()).includes('faschist')) return true;
  // Нацистская символика и коды в latin (немецкий, английский и др.), включая homoglyph-обходы.
  // Стемы (≥5 букв, без ложных префиксов) покрывают формы: swastika/swastikas, svastica, hitlers…
  if (containsLatinStems(text, ['swastik','esvastik','svastik','esvastic','svastic','hakenkreuz','hitler','neonazi','supremac'])) return true;
  if (containsLatinPhrases(text, ['sieg heil','heil hitler','white power','zyklon b','ss zeichen'])) return true;
  // Числовой неонацистский код 14/88 (и разделительные варианты: 14-88, 14 88, 1-4-8-8).
  if (stripBrush(translitOf(text.toLowerCase())).includes('1488')) return true;
  return false;
}

function containsReligiousInsult(text) {
  const lower = normalizeForMatch(text);
  for (const word of RELIGIOUS_INSULT_WORDS) {
    if (lower.includes(word)) return true;
  }
  // Русские формы «хула на Бога/плюю на крест» и центральные «религия мертва».
  // Русские формы «хула на Бога/плюю на крест» и «религия мертва». (JS \b — только латиница, поэтому граница вручную.)
  if (/(?:^|[^а-яёa-z])хул[а-яё]* на бог/iu.test(lower)) return true;
  // Мультиязычные религиозные инсульты (стемы ≥5 букв): blasphemy, sacrilege, profanation…
  if (containsLatinStems(text, ['blasphe','blasfem','sacrile','desecrat','gotteslas','profanac','blasphemi'])) return true;
  if (containsLatinPhrases(text, ['kufr','god is dead','religion is a lie'])) return true;
  return false;
}

function containsTerrorism(text) {
  const lower = normalizeForMatch(text);
  for (const word of TERRORISM_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  if (translitOf(text.toLowerCase()).includes('terror')) return true;
  if (translitOf(text.toLowerCase()).includes('dzhihad')) return true;
  if (containsLatinStems(text, ['terroris'])) return true;
  if (containsLatinPhrases(text, [
    'terrorism','jihad','islamic state','isis','isil','igil','al qaeda','alqaeda','taliban','bomb the','explosive vest','suicide bomb','suicide bomber'
  ])) return true;
  return false;
}

function containsSeparatism(text) {
  const lower = normalizeForMatch(text);
  for (const word of SEPARATISM_WORDS) {
    if (lower.includes(word)) return true;
  }
  return false;
}

function containsDrugs(text) {
  const lower = normalizeForMatch(text);
  for (const word of DRUG_WORDS) {
    if (lower.includes(word)) return true;
  }
  const t = translitOf(text.toLowerCase());
  if (t.includes('drug') || t.includes('cocaine') || t.includes('heroin') || t.includes('marihuana') || t.includes('gashish') || t.includes('amfetamin')) return true;
  if (containsLatinPhrases(text, [
    'drugs','cocaine','heroin','marijuana','hashish','methamphetamine','meth','metaamfetamin','ecstasy','mdma','lsd','lysergic','fentanyl','crystal meth','amphetamine','opiate','opioid','mephedrone','cannabis','opium'
  ])) return true;
  return false;
}

function containsCP(text) {
  const lower = normalizeForMatch(text);
  for (const word of CP_WORDS) {
    if (lower.includes(word)) return true;
  }
  if (translitOf(text.toLowerCase()).includes('child porn')) return true;
  if (translitOf(text.toLowerCase()).includes('pedophil')) return true;
  if (containsLatinStems(text, ['pedophil','paedophil','preteen'])) return true;
  if (containsLatinPhrases(text, [
    'child porn','child pornography','child sex','child abuse','underage sex','underage porn','teen porn','minor porn','cp materials','lolita'
  ])) return true;
  return false;
}

function containsForeignAgent(text) {
  const lower = normalizeForMatch(text).replace(/\s+/g, ' ');
  for (const word of FOREIGN_AGENT_WORDS) {
    if (lower.includes(word.toLowerCase())) return true;
  }
  return false;
}

function containsExtremistMaterial(text) {
  const lower = normalizeForMatch(text);
  for (const word of EXTREMIST_MATERIAL_WORDS) {
    if (lower.includes(word)) return true;
  }
  return false;
}

function containsHate(text) {
  const lower = normalizeForMatch(text);
  for (const word of HATE_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  // Расовая/национальная/религиозная вражда в latin. Стемы для длинных слов,
  // короткие («spic», «chink») — только целыми словами, чтобы не задеть «spice», «specific».
  if (containsLatinStems(text, ['nigger','nigga','faggot','kike'])) return true;
  if (containsLatinPhrases(text, [
    'fag','fags','kikes','spic','spics','chink','chinks','wetback','wetbacks','coon','coons','jews',
    'heeb','white trash','porch monkey','kill all jews','dirty jew','juden raus','go back to your country'
  ])) return true;
  return false;
}

function containsSuicide(text) {
  const lower = normalizeForMatch(text).replace(/[^а-яё0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = ['убей себя', 'убить себя', 'сделай это с собой', 'сдели это с собой', 'повесься', 'повесись', 'удавись', 'реж вены', 'уничтожь себя'];
  for (const p of phrases) {
    if (lower.includes(p)) return true;
  }
  for (const word of SUICIDE_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  if (containsLatinPhrases(text, [
    'kill yourself','killing myself','kill myself','commit suicide','committing suicide','end my life','ending my life','end it all','suicidal','do not want to live','want to die','hang myself','no reason to live','better off dead'
  ])) return true;
  return false;
}

function containsCoercion(text) {
  const lower = normalizeForMatch(text).replace(/\s+/g, ' ');
  for (const word of COERCION_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  // Падежные словоформы: "понуждение к сексу", "понуждаю к сексу", "развратные действия".
  if (/понужд[а-яёa-z]* к секс/i.test(lower)) return true;
  if (/(?:развратн|развратн[а-яёa-z]+) действи/i.test(lower)) return true;
  if (/принужд[а-яёa-z]* к секс/i.test(lower)) return true;
  // Изнасилование/принуждение в latin (границы слов: 'grape', 'scrape' и 'tap' — не триггеры).
  if (containsLatinPhrases(text, [
    'rape','raped','raping','rapist','rapists','sexually assault','sexual assault','nonconsensual','non-consensual','force you to have sex','drugged me','roofied'
  ])) return true;
  return false;
}

function containsMinorSex(text) {
  const lower = normalizeForMatch(text);
  for (const word of MINOR_SEX_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  return false;
}

function containsProstitution(text) {
  const lower = normalizeForMatch(text).replace(/\s+/g, ' ');
  for (const word of PROSTITUTION_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  return false;
}

function containsNsfw(text) {
  const lower = normalizeForMatch(text);
  for (const word of NSFW_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  // RU «анал*»: ловить «анал секс/анальная», но НЕ «анализ/аналог/аналитик/анализ*».
  const ruTokens = String(lower).split(/[^а-яёa-z]+/);
  for (const t of ruTokens) {
    if (t.startsWith('анал') && !/^анал(?:ог|из|ит)/.test(t)) return true;
  }
  // Латинское написание и homoglyph-обходы для базовых непристойных корней.
  // Только целые слова (word boundaries), чтобы 'rasskazhi' не матчилось как 'ass'.
  const translit = ` ${translitOf(text.toLowerCase())} `;
  if (/(?:[^a-z](?:fuck|fucking|porn|pornhub|xnxx|xvideos|nude|naked|cock|dick|pussy|penis|ass|boobs|tits|escort|nudes|webcam)[^a-z])/.test(translit)) return true;
  if (/\b(?:sex tape|sex video|sex cam|adult content)\b/.test(translit)) return true;
  // Мультиязычные длинные стемы (porn*/nackt*/obscen* и др.) — начальные совпадения токенов.
  if (containsLatinStems(text, ['porn','nackt','obscen','erotic','pornograph','masturbat','erotisation'])) return true;
  // Расширенный multi-язычный список (границы целых слов).
  if (containsLatinPhrases(text, [
    'anal','anal sex','analsex','blowjob','blow job','handjob','hand job','oral sex','rimjob',
    'cumshot','creampie','threesome','foursome','gangbang','cuckold','hentai','futanari',
    'lolicon','shotacon','incest','milf','cougar','bdsm','domination','dildo','vibrator','sex toy',
    'striptease','strip club','camgirl','camming','pornstar','porn star',
    'shemale','tranny','escort service','call girl','conteudo adulto','contenido adulto','contenu adulte',
    'video erotico','video x gratis','nackdfotos'
  ])) return true;
  return false;
}

function containsUnrest(text) {
  const lower = normalizeForMatch(text);
  for (const word of UNREST_WORDS) {
    if (!word) continue;
    if (lower.includes(word)) return true;
  }
  // Призывы к массовым незаконным мероприятиям в latin (целые фразы, без ложных «riot! матч», «general strike»).
  if (containsLatinPhrases(text, [
    'riot','riots','mass riot','sedition','insurrection','overthrow the','storm the government','storm the parliament','violent uprising','call to arms','barricade the'
  ])) return true;
  return false;
}

function containsLgbtPropaganda(text) {
  const lower = normalizeForMatch(text).replace(/\s+/g, ' ');
  const phrases = [
    'пропаганда лгбт','пропаганду лгбт','пропаганды лгбт','пропагандой лгбт','лгбт пропаганда','лгбт пропаганд',
    'пропагандирую лгбт','пропагандируем лгбт','пропаганда лгбт-',
    'пропаганда гомосексуализма','пропаганда гомосексуальных','пропаганда нетрадиционных сексуальных','пропаганда нетрадиционных отношений','пропаганда однополых','пропаганда гомо','пропагандирую гомосексуализм',
    'пропаганда гей','гей-пропаганда','гей пропаганда',
    'агитирую за лгбт','агитирую за гомо','агитирую за нетрадиционн','вербую в лгбт','пропаганда аморальности'
  ];
  for (const p of phrases) {
    if (lower.includes(p)) return true;
  }
  if (containsLatinPhrases(text, [
    'lgbt propaganda','propaganda lgbt','gay propaganda','propaganda gay','promote lgbt','promoting lgbt','spread lgbt','lgbt activism calls','lgbt agitation'
  ])) return true;
  return false;
}

function containsTobacco(text) {
  const lower = normalizeForMatch(text).replace(/\s+/g, ' ');
  const phrases = [
    'продам сигарет','продаю сигарет','продажа сигарет','сигарет оптом','реализ сигарет','реализация сигарет',
    'продам таба','продаю таба','табак оптом','оптовы поставки сигарет','сигарет в наличии',
    'продам вейп','продаю вейп','продам снюс','продаю снюс','снюс в наличии','реклама вейпа','вейп оптом','вейп в наличии',
    'заказать сигареты','заказать вейп','подписка на сигареты'
  ];
  for (const p of phrases) {
    if (lower.includes(p)) return true;
  }
  if (containsLatinPhrases(text, [
    'sell cigarettes','selling cigarettes','cigarettes for sale','cigarettes wholesale','cigarette sales',
    'tobacco wholesale','selling tobacco','tobacco for sale','vape shop','sell vapes','selling vapes','vapes for sale','vape wholesale','snus for sale','selling snus'
  ])) return true;
  return false;
}

const BLOCK_REASONS = new Set(['extremism', 'religious_insult', 'terrorism', 'separatism', 'drugs', 'child_exploitation', 'foreign_agent', 'extremist_material', 'hate', 'suicide', 'coercion', 'minor_sex', 'prostitution', 'nsfw', 'unrest', 'lgbt_propaganda', 'tobacco']);
const CENSOR_REASONS = new Set(['profanity']);

function normalizeCyrWord(w) {
  return String(w || '').toLowerCase().replace(/[ё]/g, 'е');
}

const TRANSLIT_PROFANITY = new Set([
  'hui', 'huj', 'huy', 'nahui', 'nahuj',
  'blya', 'blyat', 'blyad', 'blia', 'blat', 'bljad', 'bliat',
  'suka', 'suki',
  'ebat', 'jebat', 'yob', 'yobb', 'zab', 'zaebat',
  'pidor', 'pidar', 'piidor',
  'govno', 'dermo', 'jopa',
  'pizdec', 'pizda', 'pizd', 'pzd',
  'mudak', 'mudak',
  'huinya', 'hujnya', 'guynya',
]);

function censorText(text) {
  const original = String(text || '');
  const lower = original.toLowerCase().replace(/ё/g, 'е');
  const normalized = lower.split('').map((c) => LAT_TO_CYR[c] ?? c).join('');
  const stems = [...PROFANITY_WORDS, ...EXTREMISM_WORDS, ...RELIGIOUS_INSULT_WORDS, ...DRUG_WORDS]
    .map((w) => normalizeCyrWord(w))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const out = original.split('');
  const wordRe = /[а-яёa-z][а-яёa-z0-9_'-]*/gi;
  for (const m of normalized.matchAll(wordRe)) {
    const w = m[0].toLowerCase();
    const hit = stems.find((s) => w.includes(s));
    if (hit) {
      for (let i = m.index; i < m.index + m[0].length; i++) out[i] = '*';
    }
  }
  for (const m of lower.matchAll(wordRe)) {
    const w = m[0].toLowerCase();
    if (/^[a-z]+$/.test(w) && TRANSLIT_PROFANITY.has(w)) {
      for (let i = m.index; i < m.index + m[0].length; i++) out[i] = '*';
    }
  }
  return out.join('');
}

function moderateText(text) {
  const reasons = [];
  if (containsProfanity(text)) reasons.push('profanity');
  if (containsExtremism(text)) reasons.push('extremism');
  if (containsUnrest(text)) reasons.push('unrest');
  if (containsLgbtPropaganda(text)) reasons.push('lgbt_propaganda');
  if (containsTobacco(text)) reasons.push('tobacco');
  if (containsHate(text)) reasons.push('hate');
  if (containsReligiousInsult(text)) reasons.push('religious_insult');
  if (containsTerrorism(text)) reasons.push('terrorism');
  if (containsSeparatism(text)) reasons.push('separatism');
  if (containsDrugs(text)) reasons.push('drugs');
  if (containsCP(text)) reasons.push('child_exploitation');
  if (containsMinorSex(text)) reasons.push('minor_sex');
  if (containsCoercion(text)) reasons.push('coercion');
  if (containsProstitution(text)) reasons.push('prostitution');
  if (containsNsfw(text)) reasons.push('nsfw');
  if (containsSuicide(text)) reasons.push('suicide');
  if (containsForeignAgent(text)) reasons.push('foreign_agent');
  if (containsExtremistMaterial(text)) reasons.push('extremist_material');
  const blockReasons = reasons.filter((r) => BLOCK_REASONS.has(r));
  const censorReasons = reasons.filter((r) => CENSOR_REASONS.has(r));
  const blocked = blockReasons.length > 0;
  const censored = censorReasons.length > 0;
  return {
    allowed: !blocked,
    blocked,
    censored,
    action: blocked ? 'block' : censored ? 'censor' : 'allow',
    blockedReasons: blockReasons,
    censoredReasons: censorReasons,
    reasons,
    censoredText: censored && !blocked ? censorText(text) : null
  };
}

const auditLog = [];

function auditAction(userId, action, details, meta = {}) {
  const entry = {
    userId,
    action,
    details,
    timestamp: new Date().toISOString(),
    ip: meta.ip || ''
  };
  auditLog.push(entry);
  if (auditLog.length > 10000) auditLog.shift();
  // 152-ФЗ ст. 18.1: журнал хранится >= 3 лет. Персистим в Supabase (best-effort).
  const ipAddress = String(meta.ip || '').slice(0, 45);
  supabaseRequest('audit_log', {
    method: 'POST',
    body: JSON.stringify({
      user_id: String(userId || ''),
      action: String(action || ''),
      details: details || {},
      ip_address: ipAddress || null,
      user_agent: String(meta.userAgent || '').slice(0, 500) || null
    })
  }).catch(() => {});
  return entry;
}

const reportQueue = [];

async function handleReport(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const targetId = String(body.targetId || '');
    const targetType = String(body.targetType || 'user');
    const reason = String(body.reason || '');
    const details = String(body.details || '').slice(0, 500);

    if (!targetId || !reason) return sendJson(res, 400, { error: 'invalid_report' }, corsHeaders());

    const report = {
      id: `report-${Date.now()}-${randomBytes(4).toString('hex')}`,
      reporterId: user.id || user.email,
      targetId,
      targetType,
      reason,
      details,
      status: 'pending',
      statusChangedAt: null,
      reviewedBy: null,
      createdAt: new Date().toISOString()
    };
    reportQueue.push(report);
    auditAction(user.id || user.email, 'report', { targetId, targetType, reason }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });

    await supabaseRequest('reports', {
      method: 'POST',
      body: JSON.stringify({
        id: report.id,
        reporter_id: report.reporterId,
        target_id: report.targetId,
        target_type: report.targetType,
        reason: report.reason,
        details: report.details,
        status: report.status
      })
    }).catch(() => {});

    await applyAutoModerationQuorum(report.targetId);

    return sendJson(res, 200, { ok: true, reportId: report.id }, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

const REPORT_STATUS_CHANGE_AT = { pending: 0, reviewed: 2, resolved: 3, dismissed: 1 };

function handleReportStatus(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const mine = reportQueue
    .filter((r) => r.reporterId === (user.id || user.email))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      targetId: r.targetId,
      targetType: r.targetType,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      statusChangedAt: r.statusChangedAt || null
    }));
  return sendJson(res, 200, { reports: mine }, corsHeaders());
}

// Админ: очередь разбора анкет (по ADMIN_SECRET). Роутер: GET /api/moderation/review
async function handleModerationReview(req, res) {
  const headers = corsHeaders();
  if (!adminKeyOk(req)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    // Объединяем отчёты из Supabase и in-memory очереди.
    const raw = [];
    const supbaseRows = await supabaseRequest(
      `reports?status=in.(pending,reviewed)&order=created_at.desc&limit=${limit}&select=id,reporter_id,target_id,reason,details,status,created_at,reviewed_by`
    ).catch(() => null);
    if (Array.isArray(supbaseRows)) raw.push(...supbaseRows);
    for (const r of reportQueue) {
      if (r.status === 'pending' || r.status === 'reviewed') {
        raw.push({ target_id: r.targetId, reporter_id: r.reporterId, reason: r.reason, details: r.details, status: r.status, created_at: r.createdAt, reviewed_by: r.reviewedBy || null });
      }
    }

    const groups = new Map();
    for (const r of raw) {
      const t = r.target_id;
      if (!groups.has(t)) groups.set(t, { targetId: t, reportCount: 0, distinctReporters: new Set(), reasons: [], status: '' });
      const g = groups.get(t);
      g.reportCount++;
      g.distinctReporters.add(r.reporter_id);
      if (r.reason && !g.reasons.includes(r.reason)) g.reasons.push(r.reason);
      g.status = r.status;
    }
    const queues = [...groups.values()].map((g) => ({
      targetId: g.targetId,
      reportCount: g.reportCount,
      distinctReporters: g.distinctReporters.size,
      reasons: g.reasons.slice(0, 8),
      status: g.status
    })).sort((a, b) => b.reportCount - a.reportCount).slice(0, limit);

    const flaggedUsers = [];
    for (const [email, u] of Object.entries(store.users)) {
      const status = u.moderation || 'approved';
      if (status === 'blocked' || status === 'pending_review') {
        flaggedUsers.push({
          email,
          moderation: status,
          name: u.publicProfile?.name || u.syncPayload?.profile?.name || '',
          reason: u.moderationReason || '',
          updatedAt: u.updatedAt || null
        });
      }
    }

    const persisted = await supabaseRequest(
      `moderation_status?status=in.(pending_review,blocked)&order=updated_at.desc&limit=${limit}&select=target_id,status,reason,changed_by,updated_at`
    ).catch(() => null);
    const persistedFlagged = Array.isArray(persisted) ? persisted : [];

    auditAction('admin', 'moderation_review_open', {}, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    return sendJson(res, 200, { queues, flaggedUsers, persistedFlagged }, headers);
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, headers);
  }
}

// Админ: решение по анкете. Роутер: POST /api/moderation/resolve { targetId, action: approve|block|dismiss }
async function handleModerationResolve(req, res) {
  const headers = corsHeaders();
  if (!adminKeyOk(req)) return sendJson(res, 401, { error: 'unauthorized' }, headers);
  try {
    const body = await readJson(req);
    const targetId = String(body.targetId || '').trim();
    const action = String(body.action || '').trim();
    if (!targetId || !['approve', 'block', 'dismiss'].includes(action)) {
      return sendJson(res, 400, { error: 'invalid_action' }, headers);
    }
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
    const now = nowIso();
    const targetUser = store.users[targetId];

    let newStatus = null;
    if (action === 'approve') {
      newStatus = 'approved';
      if (targetUser) targetUser.moderation = 'approved';
      await persistModeration(targetId, 'approved', 'approved by moderator', 'admin');
    } else if (action === 'block') {
      newStatus = 'blocked';
      if (targetUser) { targetUser.moderation = 'blocked'; targetUser.moderationReason = 'blocked by moderator'; }
      await persistModeration(targetId, 'blocked', 'blocked by moderator', 'admin');
    }

    // Отчёты по цели: resolved для approve/block, dismissed для dismiss.
    const reportStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
    for (const r of reportQueue) {
      if (r.targetId === targetId && (r.status === 'pending' || r.status === 'reviewed')) {
        r.status = reportStatus;
        r.statusChangedAt = now;
        r.reviewedBy = 'admin';
      }
    }
    await supabaseRequest(`reports?target_id=eq.${encodeURIComponent(targetId)}&status=in.(pending,reviewed)`, {
      method: 'PATCH',
      body: JSON.stringify({ status: reportStatus, reviewed_by: 'admin', reviewed_at: now })
    }).catch(() => {});

    auditAction('admin', 'moderation_resolve', { targetId, action, newStatus }, { ip });
    return sendJson(res, 200, { ok: true, targetId, status: newStatus || reportStatus }, headers);
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, headers);
  }
}

async function handleModerate(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const text = String(body.text || '');
    const result = moderateText(text);
    auditAction(user.id || user.email, 'moderate_check', { textLength: text.length, allowed: result.allowed }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    return sendJson(res, 200, result, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleAuditLog(req, res) {
  // 152-ФЗ ст. 7: конфиденциальность. Субъект видит ТОЛЬКО свои записи.
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const uid = user.id || user.email;
  const logs = auditLog.filter((l) => l.userId === uid || l.userId === user.email).slice(-limit);
  return sendJson(res, 200, { logs }, corsHeaders());
}

async function handleDataExport(req, res) {
  // 152-ФЗ ст. 14 п. 7: субъект вправе получить копию своих ПДн.
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const email = user.email;
    const uid = user.id || email;
    let profile = await supabaseRequest(`profiles?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => null);
    let consents = await supabaseRequest(`current_consents?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => null);
    const plans = await supabaseRequest(`plans?user_id=eq.${encodeURIComponent(uid)}&select=*`).catch(() => null);
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
    auditAction(uid, 'data_export', { tables: ['local_store', 'profiles', 'current_consents', 'plans'] }, { ip, userAgent: req.headers['user-agent'] });

    const local = store.users[email] || {};
    const localProfile = user.publicProfile || local.publicProfile || null;
    const localPlans = user.plans || local.plans || {};
    const consentsRecord = consents && consents.length ? consents[0] : null;

    // Профиль: если локальный существеннее supabase-ного, используем локальный.
    if (!profile || !profile.length || (localProfile && JSON.stringify(localProfile).length > JSON.stringify(profile[0] || {}).length)) {
      profile = localProfile;
    }

    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      deadlineRespondBy: addWorkdays(new Date(), 10).toISOString(),
      operator: 'ИП Меньшиков Артем Геннадьевич',
      data: {
        account: { email, createdAt: local.createdAt, updatedAt: local.updatedAt },
        profile,
        consents: consentsRecord,
        plans: Object.keys(localPlans).length ? localPlans : ((plans || []).length ? plans : null),
        lastLocation: user.lastLocation || null,
        syncPayload: user.syncPayload || null,
        syncUpdatedAt: user.syncUpdatedAt || null,
        moderation: user.moderation || null
      }
    }, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function erasedUserId(uid) {
  return 'erased_' + createHash('sha256').update(String(uid)).digest('hex').slice(0, 32);
}

// 152-ФЗ ст. 21: субъект требует уничтожения ПДн. Журнал учета обращений (ст. 18.1)
// хранится 3 года, но без связи с личностью: user_id заменяем необратимым хэшем,
// из details вычищаем email и прочие прямые идентификаторы.
async function anonymizeAuditFor(uid) {
  const rows = await supabaseRequest(
    `audit_log?user_id=eq.${encodeURIComponent(uid)}&limit=500&select=id,details`
  ).catch(() => null);
  if (!Array.isArray(rows)) return 0;
  const erased = erasedUserId(uid);
  let n = 0;
  for (const row of rows) {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    const clean = {};
    for (const [k, v] of Object.entries(details)) {
      if (k === 'email' || k === 'accountId' || k === 'targetId') continue;
      clean[k] = v;
    }
    await supabaseRequest(`audit_log?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ user_id: erased, details: clean })
    }).catch(() => {});
    n++;
  }
  return n;
}

async function cancelActiveSubscriptionsFor(uid) {
  const canceled = [];
  if (cloudPaymentsUnavailable()) return canceled;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl) return canceled;
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(uid)}&status=in.(active,unsubscribed)&select=subscription_id`,
    { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
  ).then((r) => r.json()).catch(() => []);
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row.subscription_id) continue;
      try {
        await cpApiPost('/subscriptions/cancel', { Id: row.subscription_id });
        canceled.push(row.subscription_id);
      } catch { /* CloudPayments уже отменил сам или недоступен — продолжаем удаление */ }
    }
  }
  return canceled;
}

async function handleAccountDelete(req, res) {
  // 152-ФЗ ст. 14 п. 7, ст. 21: право на уничтожение ПДн.
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const email = user.email;
    const uid = user.id || email;
    const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
    // Аудит ДО удаления (сам аккаунт уже есть в сессии).
    auditAction(uid, 'account_delete_requested', { email }, { ip, userAgent: req.headers['user-agent'] });

    // 1. Отменяем автопродления CloudPayments, чтобы не списывали после удаления.
    const canceledSubscriptions = await cancelActiveSubscriptionsFor(uid);

    // 2. Удаляем локальное состояние (пароль, анкета, лайки в store).
    delete store.users[email];

    // 3. Удаляем из Supabase все строки, связанные с аккаунтом.
    const tables = ['current_consents', 'locations', 'plans', 'likes', 'messages', 'profiles', 'reports', 'subscriptions'];
    await Promise.all(tables.map((t) => supabaseRequest(`${t}?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null)));
    supabaseRequest(`moderation_status?target_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null);

    // Сообщения/лайки — по обоим направлениям; проверки удаляются по цели и автору.
    await Promise.all([
      supabaseRequest(`messages?from_user=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`messages?to_user=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`likes?from_user=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`likes?to_user=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`reports?reporter_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`reports?target_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null),
      supabaseRequest(`events?user_id=eq.${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(() => null)
    ]);
    for (const sid of canceledSubscriptions) {
      supabaseRequest(`subscriptions?subscription_id=eq.${encodeURIComponent(sid)}`, { method: 'DELETE' }).catch(() => null);
    }

    // 4. Журнал не удаляем, но лишаем связи с личностью (остаётся минимум 3 года).
    const anonymizedAudit = await anonymizeAuditFor(uid);

    return sendJson(res, 200, {
      ok: true,
      message: 'account_deleted',
      canceledSubscriptions: canceledSubscriptions.length,
      anonymizedAudit
    }, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function validateImageBuffer(buffer, filename) {
  if (!buffer || buffer.length < 100) return { ok: false, error: 'empty_file' };
  if (buffer.length > 10 * 1024 * 1024) return { ok: false, error: 'file_too_large_10mb' };
  const header = buffer.slice(0, 12);
  const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
  const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  const isWebP = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  const isGIF = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  const isHEIC = header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
  const allowed = isJPEG || isPNG || isWebP || isGIF || isHEIC;
  if (!allowed) return { ok: false, error: 'invalid_image_format' };
  const ext = (filename || '').split('.').pop().toLowerCase();
  const allowedExts = ['jpg','jpeg','png','webp','gif','heic','heif'];
  if (ext && !allowedExts.includes(ext)) return { ok: false, error: 'invalid_extension' };
  return { ok: true, format: isJPEG ? 'jpeg' : isPNG ? 'png' : isWebP ? 'webp' : isGIF ? 'gif' : 'heic' };
}

function checkImageFilename(filename) {
  const suspiciousPatterns = [/\.\./i, /<script/i, /javascript:/i, /\.exe$/i, /\.bat$/i, /\.sh$/i];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(filename)) return false;
  }
  return true;
}

const NSFW_SKIN_HARD_LIMIT = 0.45;
const NSFW_SKIN_REVIEW_LIMIT = 0.28;
// Категории, которые могут быть присланы при анализе изображения (vision/OCR/экспертные флаги).
const PHOTO_TRACKED_CATEGORIES = ['nsfw', 'unrest', 'lgbt_propaganda', 'tobacco', 'drugs'];

function photoAnalysisVerdict({ skinRatio, dims, categories }) {
  let verdict = 'ok';
  let risk = 'low';
  const ratio = Math.min(1, Math.max(0, Number(skinRatio) || 0));
  if (ratio >= NSFW_SKIN_HARD_LIMIT) {
    verdict = 'reject';
    risk = 'high';
  } else if (ratio >= NSFW_SKIN_REVIEW_LIMIT) {
    verdict = 'review';
    risk = 'medium';
  }
  // Дополнительные отслеживаемые категории изображения: любое совпадение → модерация (review/reject).
  const flagged = Array.isArray(categories)
    ? categories.filter((c) => PHOTO_TRACKED_CATEGORIES.includes(String(c)))
    : [];
  if (flagged.length) {
    verdict = verdict === 'reject' ? 'reject' : 'review';
    risk = 'high';
  }
  return { verdict, risk, skinRatio: Math.round(ratio * 1000) / 1000, dims: dims || null, categories: flagged };
}

async function handlePhotoAnalyze(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const { skinRatio, dims, filename, categories } = body;
    const result = photoAnalysisVerdict({ skinRatio, dims, categories });
    auditAction(user.id || user.email, 'photo_analyze', { ...result, filename }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    if (result.verdict !== 'ok') {
      const report = {
        id: `report-${Date.now()}-${randomBytes(4).toString('hex')}`,
        reporterId: user.id || user.email,
        targetId: user.id || user.email,
        targetType: 'photo',
        reason: `nsfw_${result.verdict}`,
        details: `skin_ratio=${result.skinRatio};categories=${(result.categories || []).join(',') || 'none'}`,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      reportQueue.push(report);
      await supabaseRequest('reports', {
        method: 'POST',
        body: JSON.stringify({
          id: report.id,
          reporter_id: report.reporterId,
          target_id: report.targetId,
          target_type: report.targetType,
          reason: report.reason,
          details: report.details,
          status: report.status
        })
      }).catch(() => {});
    }
    return sendJson(res, 200, result, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleValidatePhoto(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    let parsed;
    try { parsed = JSON.parse(body.toString()); } catch { return sendJson(res, 400, { error: 'invalid_json' }, corsHeaders()); }
    const { filename, mimeType, base64Data } = parsed;
    const buffer = base64Data ? Buffer.from(base64Data, 'base64') : body;
    const fnCheck = checkImageFilename(String(filename || ''));
    if (!fnCheck) return sendJson(res, 400, { error: 'suspicious_filename' }, corsHeaders());
    const validation = validateImageBuffer(buffer, filename);
    auditAction(user.id || user.email, 'photo_validate', { filename, ...validation }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    if (!validation.ok) return sendJson(res, 400, { error: validation.error }, corsHeaders());
    return sendJson(res, 200, { ok: true, format: validation.format }, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleMessage(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const text = String(body.text || '');
    if (text.length > 2000) return sendJson(res, 400, { error: 'message_too_long' }, corsHeaders());
    const moderation = moderateText(text);
    if (moderation.blocked) {
      auditAction(user.id || user.email, 'message_blocked', { reasons: moderation.blockedReasons }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
      return sendJson(res, 403, { error: 'content_blocked', reasons: moderation.blockedReasons }, corsHeaders());
    }
    auditAction(user.id || user.email, 'message', { censored: moderation.censored, reasons: moderation.censoredReasons }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    return sendJson(res, 200, { ok: true, censored: moderation.censored, censoredText: moderation.censoredText }, corsHeaders());
  } catch {
    return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function authUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = store.users[payload.sub] || null;
  if (user && user.moderation === 'blocked') return null;
  return user;
}

function ensureSeedEvents() {
  if (!Array.isArray(store.seedEvents) || !store.seedEvents.length) {
    store.seedEvents = [];
  }
}

async function handleEvents(req, res, url) {
  ensureSeedEvents();
  await refreshMoscowRemoteEvents().catch(() => {});
  const city = String(url.searchParams.get('city') || '').trim();
  const merged = mergeEvents(store.seedEvents, store.remoteEvents);
  const filtered = city ? merged.filter((e) => e.city === city) : merged;
  sendJson(res, 200, { events: filtered }, corsHeaders());
}

function venueSeed() {
  if (!Array.isArray(store.venueCatalog)) store.venueCatalog = [];
  return store.venueCatalog;
}

function handleVenues(req, res, url) {
  const city = String(url.searchParams.get('city') || '').trim();
  const kind = String(url.searchParams.get('kind') || '').trim();
  let list = venueSeed();
  if (city) list = list.filter((v) => v.city === city);
  if (kind) list = list.filter((v) => v.kind === kind);
  sendJson(res, 200, { venues: list }, corsHeaders());
}

// Детерминированная «аукционная» котировка: 3 партнёра со ставками <= бюджет.
function buildOffers(venue, guests, date, budget) {
  const guestsN = Math.max(1, Number(guests) || 1);
  const budgetN = Number(budget) || venue.priceFrom * guestsN;
  const base = Math.max(venue.priceFrom, 300) * guestsN;
  const seedStr = `${venue.id}|${date}|${guestsN}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  const partners = [
    { name: 'Место напрямую', tag: 'direct' },
    { name: 'Партнёрский сервис', tag: 'partner' },
    { name: 'Спецпредложение', tag: 'deal' }
  ];
  return partners.map((p, i) => {
    const jitter = 0.92 + rnd() * 0.12 - i * 0.045;
    let price = Math.round(base * jitter / 50) * 50;
    if (budgetN > 0 && price > budgetN) price = Math.max(Math.floor(venue.priceFrom / 2 / 50) * 50, Math.round(budgetN * 0.85 / 50) * 50);
    return { partner: p.name, tag: p.tag, price, discountPct: Math.round((1 - price / base) * 100), available: i < 2 || rnd() > 0.15 };
  });
}

function handleQuote(req, res, url) {
  const venueId = String(url.searchParams.get('venueId') || '');
  const venue = venueSeed().find((v) => v.id === venueId);
  if (!venue) return sendJson(res, 404, { error: 'venue_not_found' }, corsHeaders());
  const date = String(url.searchParams.get('date') || '');
  const budget = Number(url.searchParams.get('budget'));
  const offers = buildOffers(venue, Number(url.searchParams.get('guests') || 1), date, budget);
  sendJson(res, 200, { venueId, offers }, corsHeaders());
}

async function handleBook(req, res) {
  try {
    const body = await readJson(req);
    const venue = venueSeed().find((v) => v.id === String(body.venueId || ''));
    if (!venue) return sendJson(res, 404, { error: 'venue_not_found' }, corsHeaders());
    const guests = Math.max(1, Math.min(20, Number(body.guests) || 1));
    const date = String(body.date || '').slice(0, 10);
    const time = String(body.time || '').slice(0, 5);
    const partner = String(body.partner || 'Место напрямую').slice(0, 60);
    const paid = Number(body.price);
    if (!date || !time) return sendJson(res, 400, { error: 'date_and_time_required' }, corsHeaders());
    const id = `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    store.bookings = Artikellist(store.bookings || []);
    const booking = { id, venueId: venue.id, title: venue.title, city: venue.city, guests, date, time, partner, price: paid, status: 'confirmed', createdAt: nowIso() };
    store.bookings.push(booking);
    sendJson(res, 201, { ok: true, booking }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function Artikellist(list) {
  return Array.isArray(list) ? list : [];
}

async function handleRegister(req, res) {
  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !email.includes('@')) return sendJson(res, 400, { error: 'invalid_email' }, corsHeaders());
    if (password.length < 6) return sendJson(res, 400, { error: 'weak_password' }, corsHeaders());
    if (store.users[email]) return sendJson(res, 409, { error: 'email_exists' }, corsHeaders());
    const { saltB64, hashB64 } = hashPassword(password);
    const t = nowIso();
    store.users[email] = {
      email,
      saltB64,
      hashB64,
      createdAt: t,
      updatedAt: t,
      syncPayload: null,
      syncUpdatedAt: null,
      publicProfile: null,
      lastLocation: null,
      plans: {}
    };
    const token = signToken({ sub: email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    sendJson(res, 200, { token, email }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleLogin(req, res) {
  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const user = store.users[email];
    if (!user) return sendJson(res, 401, { error: 'invalid_credentials' }, corsHeaders());
    if (!passwordMatches(password, user.saltB64, user.hashB64)) {
      return sendJson(res, 401, { error: 'invalid_credentials' }, corsHeaders());
    }
    await loadPersistedModeration(user);
    if (user.moderation === 'blocked') {
      auditAction(user.id || user.email, 'login_blocked', { reason: 'account_blocked' }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
      return sendJson(res, 403, { error: 'account_blocked' }, corsHeaders());
    }
    const token = signToken({ sub: email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    sendJson(res, 200, { token, email }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

const MODERATION_REVIEW_COOLDOWN_MS = 1000 * 60 * 60 * 6;

function inferModerationStatus(user, profileText) {
  const m = moderateText(String(profileText || ''));
  const reasons = m.reasons;
  if (m.blocked) return 'blocked';
  if (reasons.length) return 'pending_review';
  return 'approved';
}

function profileModerationStatus(user) {
  if (user.moderation) return user.moderation;
  const text = [
    user.publicProfile?.name,
    user.publicProfile?.jobTitle,
    user.publicProfile?.education,
    user.publicProfile?.interests?.join(' '),
    user.publicProfile?.values?.join(' ')
  ].filter(Boolean).join(' ');
  return inferModerationStatus(user, text);
}

function moderationDueForReview(user) {
  if (!user.syncUpdatedAt) return true;
  return Date.now() - new Date(user.syncUpdatedAt).getTime() > MODERATION_REVIEW_COOLDOWN_MS;
}

// ============ МОДЕРАЦИЯ АНКЕТ: кворум жалоб + админ-разбор + персистентность ============

const REPORT_QUORUM_REVIEW = 3;   // уникальных жалобщиков за 24 ч → скрыть анкету до разбора
const REPORT_QUORUM_BLOCK = 7;    // уникальных жалобщиков за 24 ч → заблокировать насовсем
const MODERATION_ADMIN_SECRET = process.env.MODERATION_ADMIN_SECRET || process.env.ADMIN_SECRET || '';

function adminKeyOk(req) {
  const secret = String(req.headers['x-admin-key'] || String(req.headers.authorization || '').replace(/^Bearer /i, ''));
  return !!(MODERATION_ADMIN_SECRET && secret &&
    timingSafeEqual(Buffer.from(MODERATION_ADMIN_SECRET), Buffer.from(secret)));
}

async function loadPersistedModeration(user) {
  try {
    const rows = await supabaseRequest(`moderation_status?target_id=eq.${encodeURIComponent(user.id || user.email)}&select=status,reason`);
    if (Array.isArray(rows) && rows[0] && rows[0].status) {
      user.moderation = rows[0].status;
      user.moderationReason = rows[0].reason || '';
      user._modPersisted = true;
      return user.moderation;
    }
  } catch { /* supabase недоступен — используем in-memory */ }
  return user.moderation || null;
}

async function persistModeration(targetId, status, reason, by) {
  const payload = {
    target_id: targetId,
    status,
    reason: reason || '',
    changed_by: by || 'system',
    updated_at: nowIso()
  };
  const existing = await supabaseRequest(`moderation_status?target_id=eq.${encodeURIComponent(targetId)}&select=target_id`).catch(() => null);
  if (Array.isArray(existing) && existing.length) {
    await supabaseRequest(`moderation_status?target_id=eq.${encodeURIComponent(targetId)}`, { method: 'PATCH', body: JSON.stringify(payload) }).catch(() => {});
  } else {
    await supabaseRequest('moderation_status', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ ...payload, created_at: nowIso() })
    }).catch(() => {});
  }
}

async function countDistinctReporters(targetId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  let reporters = [];
  try {
    const rows = await supabaseRequest(
      `reports?target_id=eq.${encodeURIComponent(targetId)}&created_at=gt.${encodeURIComponent(since)}&select=reporter_id`
    );
    if (Array.isArray(rows)) reporters = rows.map((r) => r.reporter_id);
  } catch { /* ignore */ }
  for (const r of reportQueue) {
    if (r.targetId === targetId && new Date(r.createdAt).getTime() > Date.now() - hours * 60 * 60 * 1000) {
      reporters.push(r.reporterId);
    }
  }
  return new Set(reporters).size;
}

async function applyAutoModerationQuorum(targetId) {
  const distinct = await countDistinctReporters(targetId);
  if (distinct < REPORT_QUORUM_REVIEW) return;
  const status = distinct >= REPORT_QUORUM_BLOCK ? 'blocked' : 'pending_review';
  const reason = `auto_quorum: ${distinct} жалоб за 24 ч`;

  const targetUser = store.users[targetId];
  if (targetUser) {
    targetUser.moderation = status;
    targetUser.moderationReason = reason;
  }

  const now = nowIso();
  for (const r of reportQueue) {
    if (r.targetId === targetId && r.status === 'pending') {
      r.status = 'reviewed';
      r.statusChangedAt = now;
      r.reviewedBy = 'auto-quorum';
    }
  }

  await persistModeration(targetId, status, reason, 'auto-quorum');
  await supabaseRequest(`reports?target_id=eq.${encodeURIComponent(targetId)}&status=eq.pending`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'reviewed', reviewed_by: 'auto-quorum', reviewed_at: now })
  }).catch(() => {});
  auditAction('system', 'auto_moderation', { targetId, status, distinctReporters: distinct }, { ip: '' });
}

async function handleSync(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  await loadPersistedModeration(user);
  if (user.moderation === 'blocked') {
    return sendJson(res, 403, { error: 'account_blocked' }, corsHeaders());
  }
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      payload: user.syncPayload || null,
      updatedAt: user.syncUpdatedAt || null,
      moderation: profileModerationStatus(user)
    }, corsHeaders());
  }
  try {
    const body = await readJson(req);
    const payload = body.payload;
    const updatedAt = String(body.updatedAt || nowIso());
    if (payload == null || typeof payload !== 'object') return sendJson(res, 400, { error: 'invalid_payload' }, corsHeaders());
    user.syncPayload = payload;
    user.syncUpdatedAt = updatedAt;
    user.updatedAt = nowIso();
    if (!user._modPersisted || !user.moderation) {
      user.moderation = inferModerationStatus(user, safeJoin(payload, 2000));
      persistModeration(user.id || user.email, user.moderation, 'auto_inferred', 'system').catch(() => {});
    }
    auditAction(user.id || user.email, 'sync_moderation', { status: user.moderation }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    sendJson(res, 200, { ok: true, updatedAt, moderation: user.moderation }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function safeJoin(payload, maxLen) {
  if (!payload || typeof payload !== 'object') return '';
  const collect = [];
  const walk = (node) => {
    if (typeof node === 'string') collect.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(payload);
  return collect.join(' ').slice(0, maxLen);
}

async function handlePublic(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const profile = body.profile;
    if (!profile || typeof profile !== 'object') return sendJson(res, 400, { error: 'invalid_profile' }, corsHeaders());
    const name = String(profile.name || 'Пользователь').slice(0, 40);
    const communication = Array.isArray(profile.communication) ? profile.communication.slice(0, 12).map(String) : [];
    const interests = Array.isArray(profile.interests) ? profile.interests.slice(0, 20).map(String) : [];
    const values = Array.isArray(profile.values) ? profile.values.slice(0, 20).map(String) : [];
    const zodiac = String(profile.zodiac || '').slice(0, 40);
    const jobTitle = String(profile.jobTitle || '').slice(0, 60);
    const education = String(profile.education || '').slice(0, 80);
    user.publicProfile = { name, communication, interests, values, zodiac, jobTitle, education };
    if (!user._modPersisted || !user.moderation) {
      user.moderation = inferModerationStatus(user, [name, jobTitle, education, interests.join(' '), values.join(' ')].join(' '));
      persistModeration(user.id || user.email, user.moderation, 'auto_inferred', 'system').catch(() => {});
    }
    if (user.moderation === 'blocked') {
      return sendJson(res, 403, { error: 'account_blocked' }, corsHeaders());
    }
    user.updatedAt = nowIso();
    auditAction(user.id || user.email, 'public_profile_moderation', { status: user.moderation }, { ip: String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '') });
    sendJson(res, 200, { ok: true, moderation: user.moderation }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleLoc(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  try {
    const body = await readJson(req);
    const loc = body.loc;
    if (!loc || typeof loc !== 'object') return sendJson(res, 400, { error: 'invalid_loc' }, corsHeaders());
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    const cityKey = String(loc.cityKey || '').trim();
    const ts = String(loc.ts || nowIso());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, 400, { error: 'invalid_coords' }, corsHeaders());
    if (!cityKey) return sendJson(res, 400, { error: 'invalid_city' }, corsHeaders());
    user.lastLocation = { lat, lon, cityKey, ts };
    user.updatedAt = nowIso();
    sendJson(res, 200, { ok: true }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

function handleNearby(req, res, url) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const city = String(url.searchParams.get('city') || '').trim();
  const radiusKm = Math.min(10, Math.max(0.1, Number(url.searchParams.get('radiusKm') || 2)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, 400, { error: 'invalid_coords' }, corsHeaders());
  if (!city) return sendJson(res, 400, { error: 'invalid_city' }, corsHeaders());

  const out = [];
  for (const [email, u] of Object.entries(store.users)) {
    if (!u || email === user.email) continue;
    if (u.moderation === 'blocked' || u.moderation === 'rejected' || u.moderation === 'pending_review') continue;
    const loc = u.lastLocation;
    if (!loc || loc.cityKey !== city) continue;
    const distKm = haversineKm({ lat, lon }, { lat: loc.lat, lon: loc.lon });
    if (distKm <= radiusKm) {
      out.push({
        id: email,
        name: u.publicProfile?.name || 'Пользователь',
        communication: u.publicProfile?.communication || [],
        values: u.publicProfile?.values || [],
        jobTitle: u.publicProfile?.jobTitle || '',
        education: u.publicProfile?.education || '',
        lat: loc.lat,
        lon: loc.lon,
        distKm,
        updatedAt: loc.ts
      });
    }
  }
  out.sort((a, b) => a.distKm - b.distKm);
  sendJson(res, 200, { users: out }, corsHeaders());
}

async function handlePlans(req, res, url) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      const day = String(body.day || '').trim();
      const plans = Array.isArray(body.plans) ? body.plans : [];
      if (!day) return sendJson(res, 400, { error: 'invalid_day' }, corsHeaders());
      user.plans[day] = plans.slice(0, 20);
      user.updatedAt = nowIso();
      sendJson(res, 200, { ok: true }, corsHeaders());
    } catch {
      sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
    }
    return;
  }

  const city = String(url.searchParams.get('city') || '').trim();
  const out = [];
  for (const [email, u] of Object.entries(store.users)) {
    if (!u?.plans) continue;
    const cityKey = u.lastLocation?.cityKey || '';
    if (city && cityKey !== city) continue;
    for (const [day, plans] of Object.entries(u.plans)) {
      if (!Array.isArray(plans)) continue;
      out.push({
        id: `${email}:${day}`,
        email,
        name: u.publicProfile?.name || 'Пользователь',
        cityKey,
        day,
        plans
      });
    }
  }
  sendJson(res, 200, { plans: out }, corsHeaders());
}

async function readJson(req) {
  const raw = await readBody(req);
  return JSON.parse(raw || '{}');
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function mergeEvents(seed, remote) {
  const out = [];
  const seen = new Set();
  for (const list of [Array.isArray(remote) ? remote : [], Array.isArray(seed) ? seed : []]) {
    for (const ev of list) {
      if (!ev || typeof ev !== 'object') continue;
      const id = String(ev.id || `${ev.city || 'city'}:${ev.title || ev.place || ''}`).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...ev, id });
    }
  }
  return out;
}

async function refreshMoscowRemoteEvents() {
  if (Date.now() - store.remoteEventsUpdatedAt < REFRESH_TTL_MS && store.remoteEvents.length) return;
  try {
    const res = await fetch(MOSCOW_AFFIS_URL, {
      headers: {
        'user-agent': 'xystarBot/1.0 (+vercel)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parseMoscowAffiche(html);
    if (parsed.length) {
      store.remoteEvents = parsed;
      store.remoteEventsUpdatedAt = Date.now();
    }
  } catch {
    if (!store.remoteEvents.length) {
      store.remoteEvents = [];
      store.remoteEventsUpdatedAt = Date.now();
    }
  }
}

function parseMoscowAffiche(html) {
  const source = String(html || '');
  const events = [];
  const seen = new Set();

  const pushEvent = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const title = cleanText(raw.title || raw.name || raw.headline || raw.eventName || raw.caption);
    if (!title) return;
    const place = cleanText(raw.place || raw.location || raw.venue || raw.address || raw.city || 'Москва') || 'Москва';
    const startsAt = normalizeDateLike(raw.startsAt || raw.startDate || raw.datePublished || raw.date || raw.eventDate) || nowIso();
    const lat = Number(raw.lat ?? raw.latitude ?? 55.7558);
    const lon = Number(raw.lon ?? raw.lng ?? raw.longitude ?? 37.6173);
    const tags = normalizeTags(raw.tags || raw.category || raw.categories || raw.genre || raw.type || []);
    const idBase = raw.id || raw['@id'] || `${title}:${place}:${startsAt}`;
    const id = `moscow-affiche-${slugify(idBase)}`;
    if (seen.has(id)) return;
    seen.add(id);
    events.push({
      id,
      city: 'Moscow',
      title,
      place,
      lat: Number.isFinite(lat) ? lat : 55.7558,
      lon: Number.isFinite(lon) ? lon : 37.6173,
      tags: tags.length ? tags : ['culture', 'events'],
      startsAt,
      source: MOSCOW_AFFIS_URL
    });
  };

  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectEventLikeJson(JSON.parse(match[1].trim()), pushEvent);
    } catch {}
  }

  for (const match of source.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectEventLikeJson(JSON.parse(match[1].trim()), pushEvent);
    } catch {}
  }

  const cardRegex = /<(article|li|div)[^>]*>([\s\S]{0,1800}?)<\/\1>/gi;
  for (const match of source.matchAll(cardRegex)) {
    const chunk = match[2];
    const title = pickBySelectors(chunk, [
      /<h[1-4][^>]*>([\s\S]{1,180}?)<\/h[1-4]>/i,
      /<a[^>]*>([\s\S]{1,180}?)<\/a>/i
    ]);
    if (!title) continue;
    const place = pickBySelectors(chunk, [
      /(?:адрес|место|площадка|venue)[^<:]*[:\s]+([^<]{2,120})/i,
      /<span[^>]*class=["'][^"']*(?:location|address|venue)[^"']*["'][^>]*>([\s\S]{1,120}?)<\/span>/i
    ]) || 'Москва';
    const dateLabel = pickBySelectors(chunk, [
      /(\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+[а-яё]+\s+\d{4})/i,
      /(\d{1,2}\s+[а-яё]+)/i
    ]) || '';
    const tags = normalizeTags(
      pickBySelectors(chunk, [
        /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']{1,200})["']/i,
        /class=["'][^"']*(?:tag|tags|badge|category)[^"']*["'][^>]*>([\s\S]{1,200}?)<\/[^>]+>/i
      ]) || []
    );
    pushEvent({
      title: cleanText(title),
      place: cleanText(place),
      startsAt: inferStartsAt(dateLabel),
      tags
    });
  }

  if (events.length) return events.slice(0, 120);
  return [
    {
      id: 'moscow-affiche-fallback',
      city: 'Moscow',
      title: 'Культурные события Москвы',
      place: 'Москва',
      lat: 55.7558,
      lon: 37.6173,
      tags: ['culture', 'events'],
      startsAt: nowIso(),
      source: MOSCOW_AFFIS_URL
    }
  ];
}

function collectEventLikeJson(value, pushEvent) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectEventLikeJson(item, pushEvent);
    return;
  }
  if (typeof value !== 'object') return;
  if (Array.isArray(value['@graph'])) for (const item of value['@graph']) collectEventLikeJson(item, pushEvent);
  if (Array.isArray(value.items)) for (const item of value.items) collectEventLikeJson(item, pushEvent);
  if (Array.isArray(value.events)) for (const item of value.events) collectEventLikeJson(item, pushEvent);
  const type = value['@type'] || value.type;
  const typeList = Array.isArray(type) ? type.map(String) : [String(type || '')];
  const isEvent = typeList.some((t) => /event|festival|exhibition|performance|theatre|concert/i.test(t));
  const hasTitle = value.name || value.title || value.headline;
  if (isEvent || hasTitle) pushEvent(value);
}

function normalizeDateLike(value) {
  if (!value) return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeTags(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(/[,\n/|]+/g);
  return [...new Set(arr.map((x) => cleanText(x).toLowerCase()).filter(Boolean).slice(0, 8))];
}

function pickBySelectors(chunk, regexes) {
  for (const re of regexes) {
    const m = String(chunk || '').match(re);
    if (!m) continue;
    return cleanText(m[1]);
  }
  return '';
}

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const PLAN_PRICES = {
  standard: 29900,
  premium: 99900,
  vip: 299900,
  exclusive: 999900,
  income_200k: 19900,
  income_500k: 99900,
  income_1m: 99900,
  income_5m: 999900
};

const SUBSCRIPTION_PLANS = new Set(['standard', 'premium', 'vip', 'exclusive']);

const CLOUDPAYMENTS_PUBLIC_ID = process.env.CLOUDPAYMENTS_PUBLIC_ID || '';
const CLOUDPAYMENTS_API_SECRET = process.env.CLOUDPAYMENTS_API_SECRET || '';
const CLOUDPAYMENTS_API_URL = 'https://api.cloudpayments.ru';

function cloudPaymentsAuth() {
  return 'Basic ' + Buffer.from(`${CLOUDPAYMENTS_PUBLIC_ID}:${CLOUDPAYMENTS_API_SECRET}`).toString('base64');
}

function cloudPaymentsUnavailable() {
  return !CLOUDPAYMENTS_PUBLIC_ID || !CLOUDPAYMENTS_API_SECRET;
}

function cloudPaymentsHmac(secret, body, urlEncoded) {
  const normalized = urlEncoded ? body.replace(/%2F/g, '/').replace(/%3A/g, ':') : body;
  return createHmac('sha256', secret).update(normalized, 'utf8').digest('base64');
}

// Одноразовый платёж для addon'ов и первый платёж подписки через CloudPayments
async function cpApiPost(path, payload) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(payload || {})) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  const resp = await fetch(`${CLOUDPAYMENTS_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': cloudPaymentsAuth(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.Success === false) {
    throw new Error(data.Message || `cloudpayments ${resp.status}`);
  }
  return data.Model || {};
}

async function supabaseUpsertSubscription({ userId, planId, paymentId, subscriptionId, token, provider, status, expiresAt }) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const payload = {
    user_id: userId,
    plan_id: planId,
    payment_id: paymentId || '',
    subscription_id: subscriptionId || '',
    token: token || '',
    provider: provider || 'cloudpayments',
    status,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    created_at: new Date().toISOString()
  };
  await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });
}

// Config для запуска виджета на клиенте (только публичный ID, без секретов)
function handleCloudPaymentsConfig(req, res) {
  const headers = corsHeaders();
  return sendJson(res, 200, {
    enabled: !cloudPaymentsUnavailable(),
    publicId: CLOUDPAYMENTS_PUBLIC_ID,
    webhookUrl: `${req.headers.referer ? String(req.headers.referer).split('/').slice(0, 3).join('/') : ''}/api/cloudpayments/webhook`
  }, headers);
}

// Вебхук от CloudPayments: Check / Pay / Fail / Confirm / Refund / Recurrent / Cancel
async function handleCloudPaymentsWebhook(req, res) {
  const headers = corsHeaders();
  try {
    const rawBody = await readBody(req, 1_000_000);
    if (!rawBody) return sendJson(res, 200, { code: 0 }, headers);

    // Проверка подписи запроса (X-Content-HMAC / Content-HMAC)
    const provided = req.headers['x-content-hmac'] || req.headers['content-hmac'] || '';
    if (provided && !cloudPaymentsUnavailable()) {
      const decoded = cloudPaymentsHmac(CLOUDPAYMENTS_API_SECRET, rawBody, false);
      const decodedUrlEncoded = cloudPaymentsHmac(CLOUDPAYMENTS_API_SECRET, rawBody, true);
      const okHmac = timingSafeEqual(Buffer.from(decoded, 'utf8'), Buffer.from(provided, 'utf8')) ||
        timingSafeEqual(Buffer.from(decodedUrlEncoded, 'utf8'), Buffer.from(provided, 'utf8')) ||
        timingSafeEqual(Buffer.from(decoded, 'base64'), Buffer.from(provided, 'base64')) ||
        timingSafeEqual(Buffer.from(decodedUrlEncoded, 'base64'), Buffer.from(provided, 'base64'));
      if (!okHmac) return sendJson(res, 401, { error: 'invalid_signature' }, headers);
    }

    let params;
    try {
      params = JSON.parse(rawBody);
    } catch {
      params = Object.fromEntries(new URLSearchParams(rawBody));
    }
    if (!params || typeof params !== 'object') return sendJson(res, 200, { code: 0 }, headers);

    const type = params.NotificationType || params.ClType || (params.SubscriptionId ? 'Recurrent' : params.Data?.Type ? params.Data.Type[0]?.Name : 'Check');

    const amountRub = Number(params.Amount || params.Data?.CloudPayments?.Amount);
    const planId = String(params.InvoiceId || params.Data?.CloudPayments?.InvoiceId || '').replace(/^(cp|sub)[_:-]/i, '');
    const accountId = String(params.AccountId || params.Data?.CloudPayments?.AccountId || '');
    const email = String(params.Email || params.Data?.CloudPayments?.Email || '');
    const transactionId = String(params.TransactionId || params.Data?.CloudPayments?.TransactionId || '');
    const subscriptionId = String(params.SubscriptionId || params.Data?.CloudPayments?.SubscriptionId || '');
    const token = String(params.Token || params.Data?.CloudPayments?.CardId || params.Data?.CloudPayments?.Token || '');

    // Check — проверяем возможность принятия платежа
    if (type === 'Check') {
      if (!planId || !PLAN_PRICES[planId]) return sendJson(res, 200, { code: 10 }, headers);
      if (!accountId) return sendJson(res, 200, { code: 11 }, headers);
      const priceCop = PLAN_PRICES[planId];
      const expectedRub = Number((priceCop / 100).toFixed(2));
      if (Math.abs(amountRub - expectedRub) > 0.009 && !(planId && amountRub > 0)) {
        return sendJson(res, 200, { code: 12 }, headers);
      }
      return sendJson(res, 200, { code: 0 }, headers);
    }

    // Pay / Confirm — активация или продление подписки
    if (type === 'Pay' || type === 'Confirm') {
      const allPlans = new Map();
      for (const [pid, price] of Object.entries(PLAN_PRICES)) {
        allPlans.set(pid, pid);
        const rubKey = (price / 100).toFixed(2);
        allPlans.set(`${rubKey.replace('.', '_')}_rub`, pid);
      }
      let finalPlan = planId;
      if (!finalPlan || !PLAN_PRICES[finalPlan]) {
        finalPlan = allPlans.get(`${amountRub.toFixed(2).replace('.', '_')}_rub`) || '';
      }
      if (!accountId || !finalPlan || !PLAN_PRICES[finalPlan]) {
        return sendJson(res, 200, { code: 0 }, headers);
      }

      const isAddon = finalPlan.startsWith('income_');

      // Находим существующую активную подписку для продления
      let existingExpiry = null;
      try {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
        const q = subscriptionId
          ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
          : `user_id=eq.${encodeURIComponent(accountId)}&plan_id=eq.${encodeURIComponent(finalPlan)}`;
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?${q}&order=expires_at.desc&limit=1`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const rows = await resp.json();
        if (Array.isArray(rows) && rows[0]) existingExpiry = rows[0].expires_at;
      } catch { /* ignore */ }

      const now = Date.now();
      const base = existingExpiry ? Math.max(now, new Date(existingExpiry).getTime()) : now;
      const oneMonth = 1000 * 60 * 60 * 24 * 30;
      const expiresIso = new Date(base + oneMonth).toISOString();

      await supabaseUpsertSubscription({
        userId: accountId,
        planId: isAddon ? `income_${finalPlan.replace('income_', '')}` : finalPlan,
        paymentId: transactionId,
        subscriptionId,
        token,
        provider: 'cloudpayments',
        status: 'active',
        expiresAt: expiresIso
      });
      return sendJson(res, 200, { code: 0 }, headers);
    }

    // Recurrent — статус подписки изменён (Reactivate: активна после паузы; сиализованно)
    if (type === 'Recurrent') {
      const subStatus = String(params.Status || params.Data?.CloudPayments?.Status || '');
      if (!accountId && !subscriptionId) return sendJson(res, 200, { code: 0 }, headers);
      const desiredStatus = subStatus === 'Active' ? 'active' : 'canceled';
      const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
      const query = subscriptionId
        ? `subscription_id=eq.${encodeURIComponent(subscriptionId)}`
        : `user_id=eq.${encodeURIComponent(accountId)}`;
      await fetch(`${supabaseUrl}/rest/v1/subscriptions?${query}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ status: desiredStatus })
      });
      return sendJson(res, 200, { code: 0 }, headers);
    }

    // Cancel / Refund — деактивация
    if (type === 'Cancel' || type === 'Refund') {
      const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
      const query = transactionId
        ? `payment_id=eq.${encodeURIComponent(transactionId)}`
        : accountId
          ? `user_id=eq.${encodeURIComponent(accountId)}`
          : '';
      if (query) {
        await fetch(`${supabaseUrl}/rest/v1/subscriptions?${query}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ status: 'canceled' })
        });
      }
      return sendJson(res, 200, { code: 0 }, headers);
    }

    // Fail — запоминаем неудачу
    if (type === 'Fail') {
      if (accountId && transactionId) {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
        await fetch(`${supabaseUrl}/rest/v1/subscriptions?payment_id=eq.${encodeURIComponent(transactionId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ status: 'failed' })
        });
      }
      return sendJson(res, 200, { code: 0 }, headers);
    }

    return sendJson(res, 200, { code: 0 }, headers);
  } catch (err) {
    return sendJson(res, 200, { code: 0 }, headers);
  }
}

async function handleCloudPaymentsStatus(req, res, url) {
  const headers = corsHeaders();
  const userId = url.searchParams.get('userId');
  if (!userId) return sendJson(res, 400, { error: 'userId required' }, headers);
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,unsubscribed)&expires_at=gt.${new Date().toISOString()}&order=expires_at.desc&limit=1`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const rows = await resp.json();
    const data = Array.isArray(rows) ? rows[0] : null;
    return sendJson(res, 200, {
      planId: data?.plan_id || 'free',
      expiresAt: data?.expires_at || null,
      addons: data?.addons || [],
      provider: data?.provider || null
    }, headers);
  } catch (err) {
    return sendJson(res, 200, { planId: 'free' }, headers);
  }
}

// Создание одноразового счёта / привязки лично повторного платежа (для addon за 1 раз)
// Через CloudPayments виды использования: подписки и addon'ы идут черрез виджет на клиенте
// (PCI DSS безопасно: карточные данные не проходят через наш сервер).
// Этот эндпоинт возвращает конфигурацию запуска виджета для конкертной позиции.
async function handleCloudPaymentsCharge(req, res) {
  const headers = corsHeaders();
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body || '{}');
    const { planId, userId, email } = parsed;
    const accountId = String(parsed.accountId || userId || '');
    if (!planId || !PLAN_PRICES[planId]) return sendJson(res, 400, { error: 'invalid_plan' }, headers);
    if (cloudPaymentsUnavailable()) return sendJson(res, 500, { error: 'cloudpayments_not_configured' }, headers);
    if (!accountId) return sendJson(res, 400, { error: 'accountId required' }, headers);

    const amountRub = PLAN_PRICES[planId] / 100;
    const isSubscription = SUBSCRIPTION_PLANS.has(planId);
    const description = isSubscription
      ? `Подписка на ${planId.replace('_', ' ')} (${new Date().toLocaleDateString('ru-RU')})`
      : `Дополнительная опция ${planId.replace('_', ' ')}`;

    return sendJson(res, 200, {
      widget: true,
      amount: Number(amountRub.toFixed(2)),
      currency: 'RUB',
      description,
      planId,
      accountId,
      invoiceId: `cp_${planId}`,
      isSubscription,
      email: email || ''
    }, headers);
  } catch (err) {
    return sendJson(res, 500, { error: err?.message || 'cloudpayments_error' }, headers);
  }
}

// Отмена автоподписки в CloudPayments + деактивация в Supabase.
// Только владелец аккаунта (Bearer-токен), чтобы нельзя было отменить чужую подписку.
async function handleCloudPaymentsCancel(req, res) {
  const headers = corsHeaders();
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, headers);
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body || '{}');
    const requestAccountId = String(parsed.accountId || parsed.userId || user.id || user.email || '');
    if (user.id && requestAccountId && requestAccountId !== user.id && requestAccountId !== user.email) {
      return sendJson(res, 403, { error: 'not_owner' }, headers);
    }
    const accountId = user.id || user.email;
    let subscriptionId = String(parsed.subscriptionId || '');
    if (!accountId && !subscriptionId) return sendJson(res, 400, { error: 'userId or subscriptionId required' }, headers);
    if (cloudPaymentsUnavailable()) return sendJson(res, 500, { error: 'cloudpayments_not_configured' }, headers);

    const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

    let cpSubId = subscriptionId;
    if (!cpSubId) {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(accountId)}&provider=eq.cloudpayments&status=eq.active&order=expires_at.desc&limit=1`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const rows = await resp.json();
      if (Array.isArray(rows) && rows[0]?.subscription_id) cpSubId = rows[0].subscription_id;
    }

    if (cpSubId) {
      try {
        await cpApiPost('/subscriptions/cancel', { Id: cpSubId });
      } catch { /* ignore */ }
    }

    const query = accountId
      ? `user_id=eq.${encodeURIComponent(accountId)}`
      : `subscription_id=eq.${encodeURIComponent(cpSubId || '')}`;
    if (query.includes('eq.') && !query.endsWith('eq.')) {
      await fetch(`${supabaseUrl}/rest/v1/subscriptions?${query}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ status: 'unsubscribed' })
      });
    }
    return sendJson(res, 200, { ok: true }, headers);
  } catch (err) {
    return sendJson(res, 500, { error: err?.message || 'cloudpayments_cancel_error' }, headers);
  }
}

function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
}

function inferStartsAt(dateLabel) {
  const today = new Date();
  const fallback = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0));
  const lower = String(dateLabel || '').toLowerCase();
  const monthMap = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
  };
  const m = lower.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+([а-яё]+)(?:\s+(\d{4}))?/i);
  if (!m) return fallback.toISOString();
  const day = Number(m[1]);
  const month = monthMap[m[3]];
  const year = Number(m[4] || today.getFullYear());
  if (!Number.isFinite(day) || month == null) return fallback.toISOString();
  return new Date(year, month, day, 18, 0, 0).toISOString();
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const VALID_CONSENT_TYPES = [
  'agreement', 'personalData', 'newsletters', 'cookies', 'thirdPartyData',
  'specialCategories', 'profiling', 'geo', 'steps'
];

const REQUIRED_CONSENTS_FOR_REGISTRATION = ['agreement', 'personalData', 'thirdPartyData'];

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  const url = `${supabaseUrl}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      ...options.headers
    }
  });
  if (!res.ok) return null;
  return res.json();
}

async function handleConsent(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());

  if (req.method === 'GET') {
    const data = await supabaseRequest(`current_consents?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
    if (data && data.length > 0) {
      return sendJson(res, 200, { consents: data[0] }, corsHeaders());
    }
    return sendJson(res, 200, { consents: null }, corsHeaders());
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      const consents = body.consents;
      if (!consents || typeof consents !== 'object') {
        return sendJson(res, 400, { error: 'invalid_consents' }, corsHeaders());
      }

      const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
      const userAgent = req.headers['user-agent'] || '';

      const auditEntries = [];
      const currentConsents = {};

      for (const type of VALID_CONSENT_TYPES) {
        if (type in consents) {
          const granted = !!consents[type];
          currentConsents[type] = granted;
          auditEntries.push({
            user_id: user.id,
            consent_type: type,
            granted,
            ip_address: ipAddress.slice(0, 45),
            user_agent: userAgent.slice(0, 500)
          });
        }
      }

      for (const entry of auditEntries) {
        await supabaseRequest('consents', {
          method: 'POST',
          body: JSON.stringify(entry)
        });
      }

      const updatePayload = {
        user_id: user.id,
        ...currentConsents,
        updated_at: new Date().toISOString()
      };

      const existing = await supabaseRequest(`current_consents?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
      if (existing && existing.length > 0) {
        await supabaseRequest(`current_consents?user_id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload)
        });
      } else {
        await supabaseRequest('current_consents', {
          method: 'POST',
          body: JSON.stringify(updatePayload)
        });
      }

      return sendJson(res, 200, { ok: true, consents: currentConsents }, corsHeaders());
    } catch {
      return sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
    }
  }

  return sendJson(res, 405, { error: 'method_not_allowed' }, corsHeaders());
}

async function handleConsentCheck(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());

  const url = new URL(req.url, `http://${req.headers.host}`);
  const required = url.searchParams.get('required');
  const requiredTypes = required ? required.split(',') : REQUIRED_CONSENTS_FOR_REGISTRATION;

  const data = await supabaseRequest(`current_consents?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
  const consents = data && data.length > 0 ? data[0] : {};

  const missing = requiredTypes.filter((type) => !consents[type]);
  const allGranted = missing.length === 0;

  return sendJson(res, 200, { allGranted, missing, consents }, corsHeaders());
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: nowIso() }, corsHeaders());
  }
  if (req.method === 'GET' && url.pathname === '/api/events') return handleEvents(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/venues') return handleVenues(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/book/quote') return handleQuote(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/book') return handleBook(req, res);
  if (req.method === 'POST' && url.pathname === '/api/register') return handleRegister(req, res);
  if (req.method === 'POST' && url.pathname === '/api/login') return handleLogin(req, res);
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
    return sendJson(res, 200, { email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }, corsHeaders());
  }
  if (url.pathname === '/api/sync') return handleSync(req, res);
  if (url.pathname === '/api/public' && req.method === 'POST') return handlePublic(req, res);
  if (url.pathname === '/api/loc' && req.method === 'POST') return handleLoc(req, res);
  if (url.pathname === '/api/nearby' && req.method === 'GET') return handleNearby(req, res, url);
  if (url.pathname === '/api/plans') return handlePlans(req, res, url);
  if (req.method === 'GET' && url.pathname === '/api/cloudpayments/config') return handleCloudPaymentsConfig(req, res);
  if (req.method === 'POST' && url.pathname === '/api/cloudpayments/webhook') return handleCloudPaymentsWebhook(req, res);
  if (req.method === 'GET' && url.pathname === '/api/cloudpayments/status') return handleCloudPaymentsStatus(req, res, url);
  if (req.method === 'POST' && url.pathname === '/api/cloudpayments/charge') return handleCloudPaymentsCharge(req, res);
  if (req.method === 'POST' && url.pathname === '/api/cloudpayments/cancel') return handleCloudPaymentsCancel(req, res);
  if (url.pathname === '/api/consent') return handleConsent(req, res);
  if (url.pathname === '/api/consent/check') return handleConsentCheck(req, res);
  if (req.method === 'GET' && url.pathname === '/api/reports/my') return handleReportStatus(req, res);
  if (req.method === 'POST' && url.pathname === '/api/report') return handleReport(req, res);
  if (req.method === 'GET' && url.pathname === '/api/moderation/review') return handleModerationReview(req, res);
  if (req.method === 'POST' && url.pathname === '/api/moderation/resolve') return handleModerationResolve(req, res);
  if (req.method === 'POST' && url.pathname === '/api/moderate') return handleModerate(req, res);
  if (req.method === 'GET' && url.pathname === '/api/audit') return handleAuditLog(req, res);
  if (req.method === 'GET' && url.pathname === '/api/data/export') return handleDataExport(req, res);
  if (req.method === 'DELETE' && url.pathname === '/api/account') return handleAccountDelete(req, res);
  if (req.method === 'POST' && url.pathname === '/api/validate-photo') return handleValidatePhoto(req, res);
  if (req.method === 'POST' && url.pathname === '/api/photo/analyze') return handlePhotoAnalyze(req, res);
  if (req.method === 'POST' && url.pathname === '/api/message') return handleMessage(req, res);
  return sendJson(res, 404, { error: 'not_found' }, corsHeaders());
}
