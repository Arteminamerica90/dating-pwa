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
