import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js?v=43';

let clientPromise = null;

function createSupabaseClient() {
  return import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  );
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!clientPromise) clientPromise = createSupabaseClient();
  return clientPromise;
}

export async function supabaseSignUp(email, password) {
  if (!isSupabaseConfigured()) throw new Error('Supabase не настроен');
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Не удалось создать аккаунт (проверьте почту)');
  return data.user;
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