import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js?v=46';

let clientPromise = null;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error((label || 'Запрос') + ': превышено время ожидания')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function createSupabaseClient() {
  return withTimeout(
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    ),
    12000,
    'Загрузка клиента'
  );
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!clientPromise) clientPromise = createSupabaseClient();
  return clientPromise;
}

export function warmupSupabase() {
  // Загружаем SDK заранее, чтобы первый клик «Войти»/«Регистрация»
  // не ждал сетевую загрузку модуля с CDN.
  try {
    getSupabase().catch(() => {});
  } catch {
    // ignore
  }
}

export async function supabaseSignUp(email, password, options) {
  if (!isSupabaseConfigured()) throw new Error('Supabase не настроен');
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: options || {}
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Не удалось создать аккаунт (проверьте почту)');
  return { user: data.user, session: data.session };
}

export async function supabaseSignIn(email, password) {
  if (!isSupabaseConfigured()) throw new Error('Supabase не настроен');
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Не удалось войти');
  return data.user;
}

export async function supabaseSignOut() {
  if (!isSupabaseConfigured()) return;
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function supabaseResetPassword(email) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  if (error) throw new Error(error.message);
}

export async function supabaseChangePassword(newPassword) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function supabaseResendConfirmation(email) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  if (error) throw new Error(error.message);
}

export async function supabaseCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function supabaseLoadProfile(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('payload, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.payload || null;
}

export async function supabaseSaveProfile(userId, payload) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('profiles').upsert(
    { id: userId, payload, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
}

export async function supabaseListPublicProfiles({ excludeUserId, limit = 50 } = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = await getSupabase();
  let q = supabase
    .from('profiles')
    .select('id, payload, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (excludeUserId) q = q.neq('id', excludeUserId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((r) => r.payload && r.payload.profile)
    .map((r) => ({
      id: r.id,
      ...(r.payload.profile || {}),
      updatedAt: r.updated_at
    }));
}

export async function supabaseSaveLike(fromUserId, toUserId, dir) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('likes').upsert(
    { from_user: fromUserId, to_user: toUserId, dir, created_at: new Date().toISOString() },
    { onConflict: 'from_user,to_user' }
  );
  if (error) throw new Error(error.message);
}

export async function supabaseGetMyLikes(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('likes')
    .select('from_user, to_user, dir')
    .or(`from_user.eq.${userId},to_user.eq.${userId}`)
    .limit(500);
  if (error) throw new Error(error.message);
  const mine = {};
  const likedMe = {};
  for (const row of data || []) {
    if (row.from_user === userId) mine[row.to_user] = row.dir;
    if (row.to_user === userId && row.dir === 'like') likedMe[row.from_user] = true;
  }
  return { mine, likedMe };
}

export async function supabaseHasMutualLike(me, other) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('likes')
    .select('from_user, to_user')
    .or(`and(from_user.eq.${me},to_user.eq.${other},dir.eq.like),and(from_user.eq.${other},to_user.eq.${me},dir.eq.like)`)
    .limit(2);
  if (error) throw new Error(error.message);
  const rows = data || [];
  return rows.length === 2;
}

export async function supabaseEnsureMatch(me, other) {
  const supabase = await getSupabase();
  const mutual = await supabaseHasMutualLike(me, other);
  if (!mutual) return null;
  const [a_user, b_user] = me < other ? [me, other] : [other, me];
  const { data, error } = await supabase
    .from('matches')
    .upsert({ a_user, b_user }, { onConflict: 'a_user,b_user' })
    .select('a_user, b_user, matched_at, seen_a, seen_b');
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

export async function supabaseGetMyMatches(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('matches')
    .select('a_user, b_user, matched_at, seen_a, seen_b, unmatch_a, unmatch_b')
    .or(`a_user.eq.${userId},b_user.eq.${userId}`)
    .order('matched_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => {
    const other = r.a_user === userId ? r.b_user : r.a_user;
    const otherSeen = r.a_user === userId ? r.seen_b : r.seen_a;
    const otherUnmatched = r.a_user === userId ? r.unmatch_b : r.unmatch_a;
    return { other, matchedAt: r.matched_at, otherSeen, otherUnmatched };
  });
}

export async function supabaseMarkMatchSeen(me, other) {
  const supabase = await getSupabase();
  const [a_user, b_user] = me < other ? [me, other] : [other, me];
  const col = a_user === me ? 'seen_a' : 'seen_b';
  const { error } = await supabase.from('matches').update({ [col]: true }).eq('a_user', a_user).eq('b_user', b_user);
  if (error) throw new Error(error.message);
}

export async function supabaseUnmatch(me, other) {
  const supabase = await getSupabase();
  const [a_user, b_user] = me < other ? [me, other] : [other, me];
  const row = await supabase
    .from('matches')
    .select('a_user, b_user, seen_a, seen_b, unmatch_a, unmatch_b')
    .eq('a_user', a_user)
    .eq('b_user', b_user)
    .maybeSingle();
  const r = row.data;
  if (!r) return;
  const col = a_user === me ? 'unmatch_a' : 'unmatch_b';
  await supabase.from('matches').update({ [col]: true }).eq('a_user', a_user).eq('b_user', b_user);
}

export async function supabaseSaveMessage(fromUserId, toUserId, cipher) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('messages').insert({
    from_user: fromUserId,
    to_user: toUserId,
    iv: cipher.iv,
    ct: cipher.ct
  });
  if (error) throw new Error(error.message);
}

export async function supabaseGetMessages(me, other, limit = 200) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('from_user, to_user, iv, ct, created_at')
    .or(`and(from_user.eq.${me},to_user.eq.${other}),and(from_user.eq.${other},to_user.eq.${me})`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    from_user: r.from_user,
    iv: r.iv,
    ct: r.ct,
    created_at: r.created_at
  }));
}

export async function supabaseSavePlans(userId, day, plans) {
  const supabase = await getSupabase();
  const dayRows = (plans || []).map((p) => ({
    day,
    title: String(p.title || '').slice(0, 120),
    scheduled_at: p.scheduledAt || null,
    company_ok: !!p.companyOk,
    city: p.cityKey || null,
    lat: typeof p.lat === 'number' ? p.lat : null,
    lon: typeof p.lon === 'number' ? p.lon : null
  }));
  await supabase.from('plans').delete().eq('user_id', userId).eq('day', day);
  if (dayRows.length) {
    const { error } = await supabase.from('plans').insert(dayRows);
    if (error) throw new Error(error.message);
  }
}

export async function supabaseGetPlansToday(day, { city } = {}) {
  const supabase = await getSupabase();
  let q = supabase
    .from('plans')
    .select('user_id, title, scheduled_at, company_ok, city, lat, lon')
    .eq('day', day)
    .limit(200);
  if (city) q = q.eq('city', city);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ ...r }));
}

export async function supabaseSaveLocation(userId, loc) {
  if (!isSupabaseConfigured()) return;
  const supabase = await getSupabase();
  const { error } = await supabase.from('locations').upsert(
    {
      user_id: userId,
      lat: loc.lat,
      lon: loc.lon,
      acc: loc.acc || null,
      city: loc.cityKey || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

export async function supabaseGetLocations(dayAgoMs = 1000 * 60 * 60 * 24) {
  if (!isSupabaseConfigured()) return [];
  const supabase = await getSupabase();
  const since = new Date(Date.now() - dayAgoMs).toISOString();
  const { data, error } = await supabase
    .from('locations')
    .select('user_id, lat, lon, acc, city, updated_at')
    .gte('updated_at', since)
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export function supabaseOnAuth(cb) {
  if (!isSupabaseConfigured()) return () => {};
  getSupabase()
    .then((supabase) => {
      supabase.auth.onAuthStateChange((event, session) => {
        cb(event, session?.user || null);
      });
    })
    .catch(() => {});
  return () => {};
}