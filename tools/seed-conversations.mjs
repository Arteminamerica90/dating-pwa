import { derivePairKey, encryptChatText, decryptChatText } from '../chat-crypto.js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../supabase-config.js');

const ACC = {
  olga: { email: 'seed.olga@example.com', id: 'f9190bb8-4fa2-4e2b-af4f-28cedd87ed8a' },
  dmitry: { email: 'seed.dmitry@example.com', id: '65ba861b-c76e-4e48-a680-3cc5aa4240ea' },
  ekaterina: { email: 'seed.ekaterina@example.com', id: 'd24f17b0-7e65-48cc-b2d8-4c045a177b77' },
  sergey: { email: 'seed.sergey@example.com', id: '8233884d-4d5b-41de-98eb-73bd99d60102' },
  natalya: { email: 'seed.natalya@example.com', id: '408edc6f-5622-405b-8424-d331c8d7ae96' }
};
const PASSWORD = 'WalkDate2026!';

async function tokenFor(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
    signal: AbortSignal.timeout(20000)
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`login ${email}: ${JSON.stringify(d).slice(0, 120)}`);
  return d.access_token;
}

async function api(path, method, token, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  if (res.status >= 400) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
  return res;
}

async function upsertLike(token, fromId, toId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/likes?on_conflict=from_user,to_user`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ from_user: fromId, to_user: toId, dir: 'like', created_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(20000)
  });
  if (res.status >= 400) throw new Error(`upsert like: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
}

async function setupPair(aKey, aId, bKey, bId) {
  // Чистим переписку этой пары, чтобы повторные прогоны не плодили дубли.
  const pairFilter = `or=(and(from_user.eq.${aId},to_user.eq.${bId}),and(from_user.eq.${bId},to_user.eq.${aId}))`;
  await fetch(`${SUPABASE_URL}/rest/v1/messages?${pairFilter}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${aKey}` }
  }).catch(() => {});
  // Взаимные лайки → матч (как в приложении: supabaseSaveLike + supabaseEnsureMatch).
  await upsertLike(aKey, aId, bId);
  await upsertLike(bKey, bId, aId);
  const [a_user, b_user] = aId < bId ? [aId, bId] : [bId, aId];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?on_conflict=a_user,b_user`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${aKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ a_user, b_user }),
    signal: AbortSignal.timeout(20000)
  });
  if (res.status >= 400) throw new Error(`upsert match: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
}

async function sendMsg(token, fromId, toId, text) {
  const key = await derivePairKey(fromId, toId);
  const cipher = await encryptChatText(key, text);
  await api('messages', 'POST', token, { from_user: fromId, to_user: toId, iv: cipher.iv, ct: cipher.ct });
  return cipher;
}

async function readThread(tokenMe, meId, otherId) {
  const lo = meId < otherId ? meId : otherId;
  const hi = meId < otherId ? otherId : meId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?select=from_user,to_user,iv,ct,created_at&order=created_at.asc` +
      `&or=(and(from_user.eq.${lo},to_user.eq.${hi}),and(from_user.eq.${hi},to_user.eq.${lo}))&limit=100`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenMe}` }, signal: AbortSignal.timeout(20000) }
  );
  const rows = await res.json();
  const key = await derivePairKey(meId, otherId);
  const out = [];
  for (const r of rows) {
    try {
      const text = await decryptChatText(key, { iv: r.iv, ct: r.ct });
      out.push(`${r.from_user === meId ? 'me' : 'them'}: ${text}`);
    } catch { out.push('undecryptable'); }
  }
  return out;
}

console.log('Логинимся…');
const tokens = {};
for (const [name, acc] of Object.entries(ACC)) tokens[name] = await tokenFor(acc.email);

async function roundtrip(aName, bName, msgsAB, msgsBA) {
  const A = ACC[aName]; const B = ACC[bName];
  console.log(`\n=== Пара ${aName} ↔ ${bName} ===`);
  await setupPair(tokens[aName], A.id, tokens[bName], B.id);
  console.log(`матч создан (likes + matches)`);

  for (const t of msgsAB) await sendMsg(tokens[aName], A.id, B.id, t);
  console.log(`${aName} → ${bName}: ${msgsAB.length} сообщ. отправлено`);
  for (const t of msgsBA) await sendMsg(tokens[bName], B.id, A.id, t);
  console.log(`${bName} → ${aName}: ${msgsBA.length} сообщ. отправлено`);

  const fromB = await readThread(tokens[bName], B.id, A.id);
  const fromA = await readThread(tokens[aName], A.id, B.id);
  console.log(`Глазами ${bName}:`); for (const l of fromB) console.log('  ' + l);
  console.log(`Глазами ${aName}:`); for (const l of fromA) console.log('  ' + l);

  const okA = fromA.every((l) => !l.startsWith('undecryptable') && l.includes(l.startsWith('me') ? 'test' : 'test') || l.includes(':'));
  const readable = [...fromA, ...fromB].filter((l) => !l.startsWith('undecryptable')).length;
  console.log(`дешифруется: ${readable}/${fromA.length + fromB.length}`);
  return readable === fromA.length + fromB.length;
}

const ok1 = await roundtrip('olga', 'dmitry', ['Привет, Дмитрий! Это тест переписки.', 'Как прошла тренировка?'], ['Ольга, привет! Всё отлично.', 'Давай встретимся у кофейни?']);
const ok2 = await roundtrip('ekaterina', 'sergey', ['Сергей, добрый вечер! Завтра свободна?'], ['Екатерина, рад сообщению! Буду свободен вечером.']);

console.log(`\nИТОГ: ${ok1 && ok2 ? 'ВСЕ ПАРЫ OK' : 'ЕСТЬ ПРОБЛЕМЫ'}`);