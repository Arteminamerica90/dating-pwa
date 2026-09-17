import http from 'node:http';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const apiPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'api', '[...path].js');
process.env.MODERATION_ADMIN_SECRET = 'admin-test-secret';
const { default: handler } = await import(pathToFileURL(apiPath).href);

const server = createServer((req, res) => handler(req, res));
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`PASS ${name}`); }
  else { failures++; console.log(`FAIL ${name}`); }
};

async function reqJson(path, { method = 'GET', token, body, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers['x-admin-key'] = admin;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const errors = [];
async function register(name) {
  const { status, json } = await reqJson('/api/register', { method: 'POST', body: { email: `${name}@t.ru`, password: 'secret12' } });
  if (status !== 200) errors.push(`register ${name}: ${status}`);
  return json?.token;
}
async function setLoc(token) {
  await reqJson('/api/loc', { method: 'POST', token, body: { loc: { lat: 55.75, lon: 37.61, cityKey: 'Moscow' } } });
}

const tokenA = await register('a');
const tokenB = await register('b');
const tokenC = await register('c');
const tokenT = await register('targ');

await setLoc(tokenA); await setLoc(tokenB); await setLoc(tokenC); await setLoc(tokenT);

if (errors.length) { console.log('Register failures:', errors); }

// 1) T публикует анкету, проходит модерацию
const pub = await reqJson('/api/public', { method: 'POST', token: tokenT, body: { profile: { name: 'Таргет', interests: ['walks'], values: [] } } });
console.log('public statuses', pub.status, JSON.stringify(pub.json));
check('public approved', pub.json?.moderation === 'approved');

// 2) Три пользователя жалуются → кворум 3 → pending_review
for (const tk of [tokenA, tokenB, tokenC]) {
  await reqJson('/api/report', { method: 'POST', token: tk, body: { targetId: 'targ@t.ru', reason: 'Спам/фейк', details: '' } });
}
const NEARBY = '/api/nearby?lat=55.75&lon=37.61&city=Moscow';
const nearVisible = await reqJson(NEARBY, { token: tokenA });
const nearIds = (nearVisible.json?.users || []).map((u) => u.id);
const inFeed = nearIds.includes('targ@t.ru');
check('targ hidden after quorum', !inFeed && nearIds.includes('b@t.ru'));
console.log('feed ids', nearIds.join(','));

const my = await reqJson('/api/reports/my', { token: tokenA });
check('reporter sees reviewed', my.json?.reports?.length === 1 && my.json.reports[0].status === 'reviewed');

// 3) Admin review показывает очередь
const review1 = await reqJson('/api/moderation/review', { admin: 'admin-test-secret' });
check('admin review 401 without key', (await reqJson('/api/moderation/review')).status === 401);
check('admin review lists targ', review1.status === 200 && (review1.json?.queues || []).some((q) => q.targetId === 'targ@t.ru'));

// 4) Admin блокирует → логин и синк заблокированы
const resolveBlock = await reqJson('/api/moderation/resolve', { method: 'POST', admin: 'admin-test-secret', body: { targetId: 'targ@t.ru', action: 'block' } });
check('resolve block ok', resolveBlock.status === 200 && resolveBlock.json?.status === 'blocked');
const loginT = await reqJson('/api/login', { method: 'POST', body: { email: 'targ@t.ru', password: 'secret12' } });
check('login blocked', loginT.status === 403);
const syncT = await reqJson('/api/sync', { method: 'POST', token: tokenT, body: { payload: { profile: { name: 'Таргет' } }, updatedAt: new Date().toISOString() } });
check('sync blocked', syncT.status === 401 || syncT.status === 403);
const reportOnBlocked = await reqJson('/api/report', { method: 'POST', token: tokenT, body: { targetId: 'a@t.ru', reason: 'нарушение' } });
check('blocked user cannot report', reportOnBlocked.status === 401);

// 5) Admin approve возвращает анкету (нового юзера, чтоб не конфликтовать с блокировкой)
const tokenF = await check2();
if (tokenF) {
  const review2 = await reqJson('/api/moderation/review', { admin: 'admin-test-secret' });
  const foes = (review2.json?.queues || []).filter((q) => q.targetId === 'f@t.ru');
  const approve = await reqJson('/api/moderation/resolve', { method: 'POST', admin: 'admin-test-secret', body: { targetId: 'f@t.ru', action: 'approve' } });
  check('approve ok', approve.status === 200 && approve.json?.status === 'approved');
  const near2 = await reqJson(NEARBY, { token: tokenA });
  console.log('near2 ids', (near2.json?.users || []).map((u) => u.id).join(','));
  check('targ visible after approve', (near2.json?.users || []).some((u) => u.id === 'f@t.ru'));
}

async function check2() {
  const tk = await register('f');
  await setLoc(tk);
  await reqJson('/api/public', { method: 'POST', token: tk, body: { profile: { name: 'Ф', interests: [], values: [] } } });
  for (const r of [tokenA, tokenB, tokenC]) await reqJson('/api/report', { method: 'POST', token: r, body: { targetId: 'f@t.ru', reason: 'несоответствие' } });
  return tk;
}

// 6) Удаление аккаунта: cancel без авторизации → 401; полное удаление → логин невозможен.
const tokenD = await register('del');
await setLoc(tokenD);
const cancelNoAuth = await reqJson('/api/cloudpayments/cancel', { method: 'POST', body: { accountId: 'del@t.ru' } });
check('cancel requires auth', cancelNoAuth.status === 401);
const delResp = await reqJson('/api/account', { method: 'DELETE', token: tokenD });
check('account deleted', delResp.status === 200 && delResp.json?.message === 'account_deleted');
const loginDel = await reqJson('/api/login', { method: 'POST', body: { email: 'del@t.ru', password: 'secret12' } });
check('deleted user cannot login', loginDel.status === 401);
const syncDel = await reqJson('/api/sync', { method: 'GET', token: tokenD });
check('deleted user token dead', syncDel.status === 401);

server.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);