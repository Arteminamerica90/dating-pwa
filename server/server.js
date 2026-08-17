// WalkDate sync server: Node.js + Express + SQLite.
//
// Клиент (PWA на GitHub Pages) хранит данные локально и по кнопке
// «Загрузить»/«Скачать» в Настройках синхронизирует ПОЛНОЕ состояние,
// зашифрованное на клиенте (encryption.js, AES-GCM), а также публичный
// профиль для подбора пары.
//
// Запуск локально:   npm install && npm start   (порт 8787 по умолчанию)
// Деплой на Render:  новый Web Service -> этот репозиторий -> root: server,
//                    start command: npm install && npm start,
//                    env: PORT=10000, DATABASE_PATH=/data/data.db (диск)
//
// API:
//   POST /api/register {email, password}            -> {email, token}
//   POST /api/login    {email, password}            -> {email, token}
//   GET  /api/sync            (Bearer)              -> {payload|null}
//   POST /api/sync            (Bearer) {payload, updatedAt}
//   POST /api/public          (Bearer) {profile}
//   GET  /api/public                                 -> [{email, profile, updatedAt}]

import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'walkdate.db');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const PASSWORD_MIN = 6;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    pass_salt TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS public_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    profile TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const hashPassword = (password, salt) =>
  crypto.scryptSync(String(password), salt, 64).toString('hex');

const makeToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const now = () => new Date().toISOString();

function createSession(userId) {
  const token = makeToken();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, createdAt, expiresAt);
  return token;
}

function findUserByCredentials(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user) return null;
  const hash = hashPassword(password, user.pass_salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex')) ? user : null;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Требуется токен' });
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token_hash = ?
  `).get(hashToken(token));
  if (!session) return res.status(401).json({ error: 'Токен недействителен' });
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return res.status(401).json({ error: 'Токен истёк, войдите заново' });
  }
  req.userId = session.user_id;
  next();
}

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
const isPayload = (p) => p && typeof p === 'object' && p.v === 1 && typeof p.enc === 'object';

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, time: now() }));

const VENUE_CATALOG = [
  {
    id: 'msk-rest-italia', city: 'Moscow', kind: 'food', title: 'Ресторан итальянской кухни «Trattoria»',
    address: 'ул. Тверская, 12', lat: 55.7612, lon: 37.6034, tags: ['food', 'night'], priceFrom: 1500, durationMin: 120, openHours: '12:00–23:00', imageEmoji: '🍝'
  },
  {
    id: 'msk-coffee-loft', city: 'Moscow', kind: 'coffee', title: 'Кофейня Loft Coffee',
    address: 'ул. Арбат, 24', lat: 55.7487, lon: 37.5902, tags: ['coffee', 'walks', 'art'], priceFrom: 350, durationMin: 60, openHours: '08:00–22:00', imageEmoji: '☕'
  },
  {
    id: 'msk-cinema-okto', city: 'Moscow', kind: 'cinema', title: 'Кинотеатр «Октябрь»',
    address: 'ул. Новый Арбат, 24', lat: 55.7519, lon: 37.5835, tags: ['cinema'], priceFrom: 500, durationMin: 150, openHours: '10:00–01:00', imageEmoji: '🎬'
  },
  {
    id: 'msk-spa-eaze', city: 'Moscow', kind: 'spa', title: 'Массажный салон Eaze SPA',
    address: 'Пятницкая ул., 8', lat: 55.7436, lon: 37.6259, tags: ['spa', 'health'], priceFrom: 1800, durationMin: 90, openHours: '10:00–22:00', imageEmoji: '💆'
  },
  {
    id: 'msk-gym-river', city: 'Moscow', kind: 'sport', title: 'Спортзал River Fitness',
    address: 'наб. Тараса Шевченко, 23', lat: 55.7501, lon: 37.5572, tags: ['sport'], priceFrom: 600, durationMin: 90, openHours: '07:00–23:00', imageEmoji: '🏋️'
  },
  {
    id: 'msk-park-gorky', city: 'Moscow', kind: 'walks', title: 'Парк Горького — велопрогулка на двоих',
    address: 'ул. Крымский Вал, 9', lat: 55.7295, lon: 37.6031, tags: ['walks', 'sport'], priceFrom: 400, durationMin: 120, openHours: 'Круглосуточно', imageEmoji: '🚴'
  },
  {
    id: 'msk-muse-pushkin', city: 'Moscow', kind: 'museums', title: 'ГМИИ им. Пушкина — экскурсия для двоих',
    address: 'ул. Волхонка, 12', lat: 55.7447, lon: 37.6056, tags: ['museums', 'art'], priceFrom: 600, durationMin: 120, openHours: '11:00–20:00', imageEmoji: '🖼️'
  },
  {
    id: 'msk-quest-mirror', city: 'Moscow', kind: 'games', title: 'Квест «Зеркальный лабиринт» на двоих',
    address: 'ул. Большая Полянка, 7', lat: 55.7374, lon: 37.6171, tags: ['games', 'boardgames'], priceFrom: 1000, durationMin: 90, openHours: '10:00–23:00', imageEmoji: '🗝️'
  },
  {
    id: 'msk-teatro', city: 'Moscow', kind: 'art', title: 'Современный театр «Другой»',
    address: 'Чистопрудный б-р, 12', lat: 55.763, lon: 37.6416, tags: ['theatre', 'art'], priceFrom: 800, durationMin: 150, openHours: 'Спектакли: 19:00', imageEmoji: '🎭'
  },
  {
    id: 'msk-jazz-club', city: 'Moscow', kind: 'night', title: 'Джаз-клуб Night Flames',
    address: 'ул. Мясницкая, 15', lat: 55.7626, lon: 37.6341, tags: ['night', 'music'], priceFrom: 700, durationMin: 180, openHours: '19:00–02:00', imageEmoji: '🎷'
  },
  {
    id: 'spb-rest-neva', city: 'Saint Petersburg', kind: 'food', title: 'Панорамный ресторан «Нева»',
    address: 'Английская наб., 56', lat: 59.9408, lon: 30.288, tags: ['food', 'night'], priceFrom: 1800, durationMin: 120, openHours: '12:00–01:00', imageEmoji: '🍷'
  },
  {
    id: 'spb-spa-royal', city: 'Saint Petersburg', kind: 'spa', title: 'СПА-комплекс «Петровский» для пары',
    address: 'Петровская наб., 6', lat: 59.9559, lon: 30.3353, tags: ['spa', 'health'], priceFrom: 2200, durationMin: 120, openHours: '09:00–23:00', imageEmoji: '♨️'
  },
  {
    id: 'spb-cinema-auth', city: 'Saint Petersburg', kind: 'cinema', title: 'Кинотеатр «Аврора»',
    address: 'Невский пр., 60', lat: 59.9331, lon: 30.3381, tags: ['cinema'], priceFrom: 450, durationMin: 150, openHours: '10:00–02:00', imageEmoji: '🎥'
  },
  {
    id: 'spb-gym-nevsky', city: 'Saint Petersburg', kind: 'sport', title: 'Фитнес-клуб Nevsky Fitness',
    address: 'Невский пр., 120', lat: 59.9287, lon: 30.3712, tags: ['sport'], priceFrom: 550, durationMin: 90, openHours: '07:00–23:00', imageEmoji: '🏃'
  },
  {
    id: 'spb-park-pmg', city: 'Saint Petersburg', kind: 'walks', title: 'Летний сад — прогулка с гидом',
    address: 'Летний сад', lat: 59.9432, lon: 30.3323, tags: ['walks', 'art'], priceFrom: 0, durationMin: 60, openHours: '10:00–22:00', imageEmoji: '🌳'
  },
  {
    id: 'kzn-rest-tatar', city: 'Kazan', kind: 'food', title: 'Ресторан татарской кухни «Тюбетей»',
    address: 'ул. Баумана, 8', lat: 55.7903, lon: 49.1182, tags: ['food'], priceFrom: 900, durationMin: 90, openHours: '11:00–23:00', imageEmoji: '🍲'
  },
  {
    id: 'kzn-spa-kazan', city: 'Kazan', kind: 'spa', title: 'Хамам и СПА «Казанские мотивы»',
    address: 'ул. Пушкина, 18', lat: 55.7861, lon: 49.1237, tags: ['spa', 'health'], priceFrom: 1500, durationMin: 120, openHours: '10:00–22:00', imageEmoji: '🛁'
  },
  {
    id: 'kzn-cinema-mir', city: 'Kazan', kind: 'cinema', title: 'Кинотеатр «Мир»',
    address: 'ул. Астрономическая, 14', lat: 55.7923, lon: 49.1131, tags: ['cinema'], priceFrom: 400, durationMin: 150, openHours: '10:00–01:00', imageEmoji: '🎞️'
  },
  {
    id: 'kzn-gym-akts', city: 'Kazan', kind: 'sport', title: 'Спортзал АК БАРС Арена',
    address: 'пр. Хусаина Ямашева, 115', lat: 55.8214, lon: 49.1606, tags: ['sport'], priceFrom: 500, durationMin: 90, openHours: '07:00–00:00', imageEmoji: '⛹️'
  },
  {
    id: 'nsk-rest-sibir', city: 'Novosibirsk', kind: 'food', title: 'Ресторан сибирской кухни «Тайга»',
    address: 'Красный пр., 29', lat: 55.0349, lon: 82.9198, tags: ['food'], priceFrom: 1100, durationMin: 120, openHours: '12:00–00:00', imageEmoji: '🥩'
  },
  {
    id: 'nsk-spa-termal', city: 'Novosibirsk', kind: 'spa', title: 'Термальный комплекс «Сибирь»',
    address: 'ул. Кирова, 10', lat: 55.039, lon: 82.9226, tags: ['spa', 'health'], priceFrom: 1200, durationMin: 180, openHours: '09:00–23:00', imageEmoji: '🧖'
  },
  {
    id: 'nsk-gym-ocean', city: 'Novosibirsk', kind: 'sport', title: 'Фитнес-клуб Ocean Fitness',
    address: 'ул. Вокзальная магистраль, 16', lat: 55.0309, lon: 82.912, tags: ['sport'], priceFrom: 450, durationMin: 90, openHours: '06:00–23:00', imageEmoji: '🏊'
  },
  {
    id: 'nsk-cinema-basket', city: 'Novosibirsk', kind: 'cinema', title: 'Кинотеатр «Победа»',
    address: 'ул. Ленина, 7', lat: 55.0301, lon: 82.9207, tags: ['cinema'], priceFrom: 420, durationMin: 150, openHours: '10:00–01:00', imageEmoji: '🍿'
  }
];

const _bookings = [];

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
    let price = Math.round((base * jitter) / 50) * 50;
    if (budgetN > 0 && price > budgetN) price = Math.max(Math.floor(venue.priceFrom / 2 / 50) * 50, Math.round((budgetN * 0.85) / 50) * 50);
    return { partner: p.name, tag: p.tag, price, discountPct: Math.round((1 - price / base) * 100), available: i < 2 || rnd() > 0.15 };
  });
}

app.get('/api/venues', (req, res) => {
  const city = String(req.query.city || '').trim();
  const kind = String(req.query.kind || '').trim();
  let list = VENUE_CATALOG;
  if (city) list = list.filter((v) => v.city === city);
  if (kind) list = list.filter((v) => v.kind === kind);
  res.json({ venues: list });
});

app.get('/api/book/quote', (req, res) => {
  const venue = VENUE_CATALOG.find((v) => v.id === String(req.query.venueId || ''));
  if (!venue) return res.status(404).json({ error: 'venue_not_found' });
  const offers = buildOffers(venue, Number(req.query.guests || 1), String(req.query.date || ''), Number(req.query.budget));
  res.json({ venueId: venue.id, offers });
});

app.post('/api/book', (req, res) => {
  const venue = VENUE_CATALOG.find((v) => v.id === String(req.body?.venueId || ''));
  if (!venue) return res.status(404).json({ error: 'venue_not_found' });
  const guests = Math.max(1, Math.min(20, Number(req.body?.guests) || 1));
  const date = String(req.body?.date || '').slice(0, 10);
  const time = String(req.body?.time || '').slice(0, 5);
  const partner = String(req.body?.partner || 'Место напрямую').slice(0, 60);
  const price = Number(req.body?.price);
  if (!date || !time) return res.status(400).json({ error: 'date_and_time_required' });
  const booking = {
    id: `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    venueId: venue.id,
    title: venue.title,
    city: venue.city,
    guests,
    date,
    time,
    partner,
    price,
    status: 'confirmed',
    createdAt: now()
  };
  _bookings.push(booking);
  res.status(201).json({ ok: true, booking });
});

app.post('/api/register', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!validateEmail(email)) return res.status(400).json({ error: 'Некорректный email' });
  if (password.length < PASSWORD_MIN) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Такой email уже зарегистрирован' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare('INSERT INTO users (email, pass_salt, pass_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(email, salt, hashPassword(password, salt), now());
  const token = createSession(info.lastInsertRowid);
  res.status(201).json({ email, token });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Укажите email и пароль' });
  const user = findUserByCredentials(email, password);
  if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
  res.json({ email: user.email, token: createSession(user.id) });
});

app.get('/api/sync', auth, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM state WHERE user_id = ?').get(req.userId);
  if (!row) return res.json({ payload: null });
  res.json({ payload: JSON.parse(row.payload), updatedAt: row.updated_at });
});

app.post('/api/sync', auth, (req, res) => {
  const { payload, updatedAt } = req.body || {};
  if (!isPayload(payload)) return res.status(400).json({ error: 'Некорректный payload' });
  const ts = String(updatedAt || now());
  db.prepare(`
    INSERT INTO state (user_id, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(req.userId, JSON.stringify(payload), ts);
  res.json({ ok: true, updatedAt: ts });
});

app.post('/api/public', auth, (req, res) => {
  const profile = req.body?.profile;
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Нет profile' });
  const ts = now();
  db.prepare(`
    INSERT INTO public_profiles (user_id, profile, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at
  `).run(req.userId, JSON.stringify(profile), ts);
  res.json({ ok: true });
});

app.get('/api/public', (req, res) => {
  const rows = db.prepare(`
    SELECT u.email, p.profile, p.updated_at
    FROM public_profiles p JOIN users u ON u.id = p.user_id
    ORDER BY p.updated_at DESC
  `).all();
  res.json(rows.map((r) => ({ email: r.email, profile: JSON.parse(r.profile), updatedAt: r.updated_at })));
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`WalkDate server listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
