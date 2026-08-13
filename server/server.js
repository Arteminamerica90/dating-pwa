import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = resolve(process.cwd(), 'data');
const USERS_FILE = resolve(DATA_DIR, 'users.json');
const EVENTS_FILE = resolve(DATA_DIR, 'events.json');
const MOSCOW_REMOTE_EVENTS_FILE = resolve(DATA_DIR, 'moscow-remote-events.json');
const SECRET = process.env.SECRET || 'dev-secret-change-me';
const MOSCOW_AFFIS_URL = process.env.MOSCOW_AFFIS_URL || 'https://transport.mos.ru/events';

mkdirSync(DATA_DIR, { recursive: true });

function loadJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function text(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req, limitBytes = 1_000_000) {
  return new Promise((resolveBody, reject) => {
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
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
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
    const obj = JSON.parse(Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'));
    if (!obj || !obj.sub || !obj.exp) return null;
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

function corsHeaders(req) {
  const origin = req.headers.origin || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
}

function ensureSeedEvents() {
  const events = loadJson(EVENTS_FILE, null);
  if (events) return;

  const seed = [
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
  ];

  saveJson(EVENTS_FILE, seed);
}

ensureSeedEvents();
refreshMoscowRemoteEvents().catch(() => {});
setInterval(() => {
  refreshMoscowRemoteEvents().catch(() => {});
}, 1000 * 60 * 60 * 6);

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders(req) });
    res.end();
    return;
  }

  // Health
  if (req.method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true, time: nowIso() }, corsHeaders(req));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const city = String(url.searchParams.get('city') || '').trim();
    const events = loadJson(EVENTS_FILE, []);
    const remote = loadJson(MOSCOW_REMOTE_EVENTS_FILE, []);
    const merged = mergeEvents(events, remote);
    const filtered = city ? merged.filter((e) => e.city === city) : merged;
    json(res, 200, { events: filtered }, corsHeaders(req));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    return void handleRegister(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    return void handleLogin(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = authUser(req);
    if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));
    json(res, 200, { email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }, corsHeaders(req));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sync') {
    const user = authUser(req);
    if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));
    json(res, 200, { payload: user.syncPayload || null, updatedAt: user.syncUpdatedAt || null }, corsHeaders(req));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sync') {
    return void handleSync(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/public') {
    return void handlePublic(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/loc') {
    return void handleLoc(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/nearby') {
    return void handleNearby(req, res, url);
  }

  text(res, 404, 'Not found', corsHeaders(req));
}

function authUser(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const users = loadJson(USERS_FILE, {});
  const user = users[payload.sub] || null;
  if (!user) return null;
  return user;
}

async function handleRegister(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!email || !email.includes('@')) return json(res, 400, { error: 'invalid_email' }, corsHeaders(req));
    if (password.length < 6) return json(res, 400, { error: 'weak_password' }, corsHeaders(req));

    const users = loadJson(USERS_FILE, {});
    if (users[email]) return json(res, 409, { error: 'email_exists' }, corsHeaders(req));

    const { saltB64, hashB64 } = hashPassword(password);
    const t = nowIso();

    users[email] = {
      email,
      saltB64,
      hashB64,
      createdAt: t,
      updatedAt: t,
      syncPayload: null,
      syncUpdatedAt: null
    };

    saveJson(USERS_FILE, users);

    const token = signToken({ sub: email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    json(res, 200, { token, email }, corsHeaders(req));
  } catch {
    json(res, 400, { error: 'bad_request' }, corsHeaders(req));
  }
}

async function handleLogin(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    const users = loadJson(USERS_FILE, {});
    const user = users[email];
    if (!user) return json(res, 401, { error: 'invalid_credentials' }, corsHeaders(req));

    const ok = passwordMatches(password, user.saltB64, user.hashB64);
    if (!ok) return json(res, 401, { error: 'invalid_credentials' }, corsHeaders(req));

    const token = signToken({ sub: email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    json(res, 200, { token, email }, corsHeaders(req));
  } catch {
    json(res, 400, { error: 'bad_request' }, corsHeaders(req));
  }
}

async function handleSync(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

  try {
    const raw = await readBody(req, 2_000_000);
    const body = JSON.parse(raw || '{}');
    const payload = body.payload;
    const updatedAt = String(body.updatedAt || nowIso());

    // Payload is expected to be encrypted on the client.
    if (payload == null || typeof payload !== 'object') return json(res, 400, { error: 'invalid_payload' }, corsHeaders(req));

    const users = loadJson(USERS_FILE, {});
    const cur = users[user.email];
    if (!cur) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

    cur.syncPayload = payload;
    cur.syncUpdatedAt = updatedAt;
    cur.updatedAt = nowIso();

    users[user.email] = cur;
    saveJson(USERS_FILE, users);

    json(res, 200, { ok: true, updatedAt: cur.syncUpdatedAt }, corsHeaders(req));
  } catch {
    json(res, 400, { error: 'bad_request' }, corsHeaders(req));
  }
}

async function handlePublic(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

  try {
    const raw = await readBody(req, 200_000);
    const body = JSON.parse(raw || '{}');
    const profile = body.profile;
    if (!profile || typeof profile !== 'object') return json(res, 400, { error: 'invalid_profile' }, corsHeaders(req));

    const users = loadJson(USERS_FILE, {});
    const cur = users[user.email];
    if (!cur) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

    const name = String(profile.name || 'Пользователь').slice(0, 40);
    const communication = Array.isArray(profile.communication) ? profile.communication.slice(0, 12).map(String) : [];
    const interests = Array.isArray(profile.interests) ? profile.interests.slice(0, 20).map(String) : [];
    const values = Array.isArray(profile.values) ? profile.values.slice(0, 20).map(String) : [];
    const jobTitle = String(profile.jobTitle || '').slice(0, 60);
    const education = String(profile.education || '').slice(0, 80);

    cur.publicProfile = { name, communication, interests, values, jobTitle, education };
    cur.updatedAt = nowIso();
    users[user.email] = cur;
    saveJson(USERS_FILE, users);

    json(res, 200, { ok: true }, corsHeaders(req));
  } catch {
    json(res, 400, { error: 'bad_request' }, corsHeaders(req));
  }
}

async function handleLoc(req, res) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

  try {
    const raw = await readBody(req, 200_000);
    const body = JSON.parse(raw || '{}');
    const loc = body.loc;
    if (!loc || typeof loc !== 'object') return json(res, 400, { error: 'invalid_loc' }, corsHeaders(req));

    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    const cityKey = String(loc.cityKey || '').trim();
    const ts = String(loc.ts || nowIso());

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: 'invalid_coords' }, corsHeaders(req));
    if (!cityKey) return json(res, 400, { error: 'invalid_city' }, corsHeaders(req));

    const users = loadJson(USERS_FILE, {});
    const cur = users[user.email];
    if (!cur) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

    cur.lastLocation = { lat, lon, cityKey, ts };
    cur.updatedAt = nowIso();
    users[user.email] = cur;
    saveJson(USERS_FILE, users);

    json(res, 200, { ok: true }, corsHeaders(req));
  } catch {
    json(res, 400, { error: 'bad_request' }, corsHeaders(req));
  }
}

function handleNearby(req, res, url) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const city = String(url.searchParams.get('city') || '').trim();
  const radiusKm = Math.min(10, Math.max(0.1, Number(url.searchParams.get('radiusKm') || 2)));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: 'invalid_coords' }, corsHeaders(req));
  if (!city) return json(res, 400, { error: 'invalid_city' }, corsHeaders(req));

  const users = loadJson(USERS_FILE, {});
  const me = users[user.email];
  if (!me) return json(res, 401, { error: 'unauthorized' }, corsHeaders(req));

  const here = { lat, lon };
  const out = [];
  for (const [email, u] of Object.entries(users)) {
    if (!u || email === user.email) continue;
    const loc = u.lastLocation;
    if (!loc || loc.cityKey !== city) continue;
    const distKm = haversineKm(here, { lat: loc.lat, lon: loc.lon });
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
  json(res, 200, { users: out }, corsHeaders(req));
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
  try {
    const res = await fetch(MOSCOW_AFFIS_URL, {
      headers: {
        'user-agent': 'WalkDateBot/1.0 (+local dev)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const parsed = parseMoscowAffiche(html);
    if (parsed.length) {
      saveJson(MOSCOW_REMOTE_EVENTS_FILE, parsed);
      console.log(`Refreshed Moscow remote events: ${parsed.length}`);
    } else if (!existsSync(MOSCOW_REMOTE_EVENTS_FILE)) {
      saveJson(MOSCOW_REMOTE_EVENTS_FILE, []);
    }
  } catch (err) {
    console.warn(`Moscow events refresh failed: ${err?.message || err}`);
    if (!existsSync(MOSCOW_REMOTE_EVENTS_FILE)) {
      saveJson(MOSCOW_REMOTE_EVENTS_FILE, []);
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

  // 1) JSON-LD blocks
  for (const match of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      collectEventLikeJson(parsed, pushEvent);
    } catch {
      // ignore malformed json
    }
  }

  // 2) Next.js / hydration data
  for (const match of source.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      collectEventLikeJson(parsed, pushEvent);
    } catch {
      // ignore malformed json
    }
  }

  // 3) Heuristic article cards / anchors
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

  // Fallback when the source markup changes: keep one generic cultural event card.
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

  if (Array.isArray(value['@graph'])) {
    for (const item of value['@graph']) collectEventLikeJson(item, pushEvent);
  }
  if (Array.isArray(value.items)) {
    for (const item of value.items) collectEventLikeJson(item, pushEvent);
  }
  if (Array.isArray(value.events)) {
    for (const item of value.events) collectEventLikeJson(item, pushEvent);
  }

  const type = value['@type'] || value.type;
  const typeList = Array.isArray(type) ? type.map(String) : [String(type || '')];
  const isEvent = typeList.some((t) => /event|festival|exhibition|performance|theatre|concert/i.test(t));
  const hasTitle = value.name || value.title || value.headline;
  if (isEvent || hasTitle) {
    pushEvent(value);
  }
}

function normalizeDateLike(value) {
  if (!value) return null;
  const s = String(value).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
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
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'event';
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

const server = http.createServer(route);
server.listen(PORT, HOST, () => {
  console.log(`WalkDate API listening on http://${HOST}:${PORT}`);
});
