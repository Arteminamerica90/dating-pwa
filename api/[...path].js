import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

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

function authUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return store.users[payload.sub] || null;
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
    const token = signToken({ sub: email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    sendJson(res, 200, { token, email }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
}

async function handleSync(req, res) {
  const user = authUser(req);
  if (!user) return sendJson(res, 401, { error: 'unauthorized' }, corsHeaders());
  if (req.method === 'GET') {
    return sendJson(res, 200, { payload: user.syncPayload || null, updatedAt: user.syncUpdatedAt || null }, corsHeaders());
  }
  try {
    const body = await readJson(req);
    const payload = body.payload;
    const updatedAt = String(body.updatedAt || nowIso());
    if (payload == null || typeof payload !== 'object') return sendJson(res, 400, { error: 'invalid_payload' }, corsHeaders());
    user.syncPayload = payload;
    user.syncUpdatedAt = updatedAt;
    user.updatedAt = nowIso();
    sendJson(res, 200, { ok: true, updatedAt }, corsHeaders());
  } catch {
    sendJson(res, 400, { error: 'bad_request' }, corsHeaders());
  }
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
    user.updatedAt = nowIso();
    sendJson(res, 200, { ok: true }, corsHeaders());
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
        'user-agent': 'WalkDateBot/1.0 (+vercel)'
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

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || '';

function yookassaAuth() {
  return 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');
}

const PLAN_PRICES = {
  standard: 29900,
  premium: 99900,
  vip: 299900,
  income_200k: 19900,
  income_500k: 49900,
  income_1m: 99900,
  income_5m: 299900
};

async function handleYooKassaCreatePayment(req, res) {
  const headers = corsHeaders();
  try {
    const body = await readBody(req);
    const { planId, userId, email } = JSON.parse(body || '{}');
    if (!planId || !PLAN_PRICES[planId]) return sendJson(res, 400, { error: 'invalid_plan' }, headers);
    if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) return sendJson(res, 500, { error: 'yookassa_not_configured' }, headers);

    const amount = PLAN_PRICES[planId];
    const description = `WalkDate — ${planId}`;
    const return_url = `${req.headers.referer || 'https://xystar.ru/'}?payment=success`;

    const yookassaRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': yookassaAuth(),
        'Content-Type': 'application/json',
        'Idempotence-Key': `${userId || 'anon'}-${planId}-${Date.now()}`
      },
      body: JSON.stringify({
        amount: { value: (amount / 100).toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url },
        description,
        metadata: { userId: userId || '', planId, email: email || '' },
        receipt: email ? {
          customer: { email },
          items: [{
            description,
            quantity: '1.00',
            amount: { value: (amount / 100).toFixed(2), currency: 'RUB' },
            vat_code: 1,
            payment_mode: 'full_payment',
            payment_subject: 'service'
          }]
        } : undefined
      })
    });

    const data = await yookassaRes.json();
    if (!yookassaRes.ok) return sendJson(res, yookassaRes.status, { error: data?.error?.message || 'yookassa_error' }, headers);

    return sendJson(res, 200, {
      paymentId: data.id,
      confirmationUrl: data.confirmation?.confirmation_url || null,
      status: data.status
    }, headers);
  } catch (err) {
    return sendJson(res, 500, { error: err?.message || 'internal' }, headers);
  }
}

async function handleYooKassaWebhook(req, res) {
  const headers = corsHeaders();
  try {
    const body = await readBody(req);
    const event = JSON.parse(body || '{}');

    if (event.type === 'payment.succeeded') {
      const meta = event.object?.metadata || {};
      const userId = meta.userId;
      const planId = meta.planId;
      if (userId && planId) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
        await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            user_id: userId,
            plan_id: planId,
            payment_id: event.object.id,
            status: 'active',
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString()
          })
        });
      }
    }

    if (event.type === 'payment.canceled') {
      const meta = event.object?.metadata || {};
      if (meta.userId) {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
        await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(meta.userId)}&payment_id=eq.${encodeURIComponent(event.object.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ status: 'canceled' })
        });
      }
    }

    return sendJson(res, 200, { ok: true }, headers);
  } catch (err) {
    return sendJson(res, 200, { ok: true }, headers);
  }
}

async function handleYooKassaStatus(req, res, url) {
  const headers = corsHeaders();
  const userId = url.searchParams.get('userId');
  if (!userId) return sendJson(res, 400, { error: 'userId required' }, headers);
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://mdabznllmqnhddgwontq.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&expires_at=gt.${new Date().toISOString()}&order=expires_at.desc&limit=1`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const rows = await resp.json();
    const data = Array.isArray(rows) ? rows[0] : null;
    return sendJson(res, 200, {
      planId: data?.plan_id || 'free',
      expiresAt: data?.expires_at || null,
      addons: data?.addons || []
    }, headers);
  } catch (err) {
    return sendJson(res, 200, { planId: 'free' }, headers);
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
  if (req.method === 'POST' && url.pathname === '/api/yookassa/create-payment') return handleYooKassaCreatePayment(req, res);
  if (req.method === 'POST' && url.pathname === '/api/yookassa/webhook') return handleYooKassaWebhook(req, res);
  if (req.method === 'GET' && url.pathname === '/api/yookassa/status') return handleYooKassaStatus(req, res, url);
  return sendJson(res, 404, { error: 'not_found' }, corsHeaders());
}
