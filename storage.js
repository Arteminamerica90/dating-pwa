import { idbDel, idbGet, idbSet } from './idb.js';
import { decryptJson, deriveKeyFromPassphrase, encryptJson } from './encryption.js';

const STATE_KEY = 'state';
const CRYPTO_KEY = 'crypto';
const LEGACY_LS_KEY = 'walkdate.state.v1';
const DEFAULT_SERVER_URL =
  typeof location !== 'undefined' && !/localhost|127\.0\.0\.1/i.test(location.hostname)
    ? location.origin
    : 'http://localhost:8787';

export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultState() {
  return {
    version: 2,
    profile: {
      name: 'Вы',
      description: '',
      zodiac: '',
      cityOverride: 'auto',
      questionnaireAnswers: {},
      portrait: {},
      interests: [],
      communication: [],
      jobTitle: '',
      education: '',
      desiredPlace: '',
      budget: '',
      wishlistPlaces: [],
      customPlaces: [],
      values: [],
      valuesAdultUnlocked: false,
      photos: [],
      onboarded: false
    },
    consent: {
      asked: false,
      geo: false,
      steps: false
    },
    steps: {
      day: todayKey(),
      value: 0
    },
    geo: {
      tracking: false,
      points: [],
      mapShare: false,
      planShare: false
    },
    lastKnown: null,
    ui: {
      homePanel: 'messages',
      activeChatId: null,
      eventsView: 'places',
      circleView: 'circle',
      circleDraft: {
        friendName: '',
        friendRelation: 'friend',
        candidateId: '',
        recipientName: '',
        positiveTags: [],
        nuanceTags: [],
        comment: ''
      }
    },
    messages: {
      activeThreadId: null,
      threads: {}
    },
    circle: {
      friends: [],
      recommendations: []
    },
    dating: {
      likes: {},
      matches: [],
      seenMatches: {},
      filters: {
        meetingIntent: [],
        stepsBucket: '',
        distanceKm: 500,
        meetingPlaces: []
      }
    },
    cloud: {
      enabled: false,
      serverUrl: DEFAULT_SERVER_URL,
      token: null,
      email: ''
    },
    encryption: {
      enabled: false,
      saltB64: null,
      iterations: 210000
    },
    health: {
      last: {
        day: todayKey(),
        mood: 3,
        energy: 3,
        sleepHours: 7,
        note: ''
      },
      history: []
    },
    plans: {
      day: todayKey(),
      items: [],
      companyOk: false
    }
  };
}

export async function loadState() {
  const legacy = loadLegacyLocalStorage();
  if (legacy) {
    // Best-effort migrate.
    const migrated = migrateV1ToV2(legacy);
    try {
      localStorage.removeItem(LEGACY_LS_KEY);
    } catch {
      // ignore
    }
    await saveState(migrated, { noEncrypt: true });
    return migrated;
  }

  const cryptoMeta = (await idbGet(CRYPTO_KEY)) || null;
  const record = (await idbGet(STATE_KEY)) || null;

  if (!record) return defaultState();

  // If encrypted, we cannot decrypt without passphrase.
  if (record.type === 'enc') {
    const st = mergeDefaults(record.preview || {}, defaultState());
    st.encryption.enabled = true;
    st.encryption.saltB64 = cryptoMeta?.saltB64 || null;
    st.encryption.iterations = cryptoMeta?.iterations || st.encryption.iterations;
    st.__locked = true;
    return st;
  }

  if (record.type === 'plain') {
    const st = mergeDefaults(record.state || {}, defaultState());
    st.encryption.enabled = false;
    st.__locked = false;
    return st;
  }

  return defaultState();
}

export async function saveState(state, { noEncrypt } = {}) {
  const st = sanitizeState(state);

  if (noEncrypt || !st.encryption?.enabled) {
    await idbSet(STATE_KEY, { type: 'plain', state: st });
    await idbDel(CRYPTO_KEY);
    return;
  }

  // Store encrypted blob + minimal preview to render UI while locked.
  const meta = (await idbGet(CRYPTO_KEY)) || null;
  if (!meta?.saltB64) {
    throw new Error('Шифрование включено, но нет соли. Выполните unlock/enable сначала.');
  }

  // We intentionally do not keep a key in storage; caller provides a session key.
  if (!state.__cryptoKey) {
    throw new Error('Нет ключа в сессии. Разблокируйте приложение.');
  }

  const payload = await encryptJson(state.__cryptoKey, st);
  await idbSet(STATE_KEY, {
    type: 'enc',
    enc: payload,
    preview: {
      version: st.version,
      profile: {
        name: st.profile?.name || 'Вы',
        description: st.profile?.description || '',
        zodiac: st.profile?.zodiac || '',
        questionnaireAnswers: st.profile?.questionnaireAnswers || {},
        portrait: st.profile?.portrait || {},
        cityOverride: st.profile?.cityOverride || 'auto',
        interests: st.profile?.interests || [],
        communication: st.profile?.communication || [],
        jobTitle: st.profile?.jobTitle || '',
        education: st.profile?.education || '',
        desiredPlace: st.profile?.desiredPlace || '',
        budget: st.profile?.budget || '',
        wishlistPlaces: st.profile?.wishlistPlaces || [],
        customPlaces: st.profile?.customPlaces || [],
        values: st.profile?.values || [],
        valuesAdultUnlocked: !!st.profile?.valuesAdultUnlocked,
        photos: st.profile?.photos || [],
        onboarded: !!st.profile?.onboarded
      },
      consent: st.consent || { asked: true, geo: false, steps: false },
      ui: st.ui || { homePanel: 'feed', activeChatId: null, eventsView: 'places' },
      circle: st.circle || { friends: [], recommendations: [] },
      encryption: { enabled: true },
      cloud: st.cloud || { enabled: false }
    }
  });
  await idbSet(CRYPTO_KEY, {
    saltB64: meta.saltB64,
    iterations: meta.iterations || st.encryption.iterations || 210000
  });
}

export async function clearState() {
  await idbDel(STATE_KEY);
  await idbDel(CRYPTO_KEY);
}

export async function exportState(state) {
  const st = sanitizeState(state);
  return JSON.stringify(st, null, 2);
}

export async function importStateFromJson(jsonText, state) {
  const obj = JSON.parse(jsonText);
  if (!obj || typeof obj !== 'object') throw new Error('Некорректный JSON');
  if (obj.version !== 2 && obj.version !== 1) throw new Error('Неподдерживаемая версия');

  let next = obj.version === 1 ? migrateV1ToV2(obj) : obj;
  next = mergeDefaults(next, defaultState());

  // Keep encryption setting from current session (imported JSON is plain).
  next.encryption.enabled = !!state?.encryption?.enabled;
  next.encryption.saltB64 = state?.encryption?.saltB64 || next.encryption.saltB64;
  next.encryption.iterations = state?.encryption?.iterations || next.encryption.iterations;

  // Persist.
  if (next.encryption.enabled) {
    if (!state?.__cryptoKey) throw new Error('Импорт в зашифрованное хранилище требует разблокировки.');
    next.__cryptoKey = state.__cryptoKey;
  }
  await saveState(next);
  return next;
}

export async function getCryptoMeta() {
  return (await idbGet(CRYPTO_KEY)) || null;
}

export async function enableEncryption(passphrase, state) {
  if (!passphrase || passphrase.length < 6) throw new Error('Пароль должен быть минимум 6 символов');

  const existing = (await idbGet(CRYPTO_KEY)) || null;
  const { key, saltB64, iterations } = await deriveKeyFromPassphrase(
    passphrase,
    existing?.saltB64 || null,
    existing?.iterations || state?.encryption?.iterations || 210000
  );

  await idbSet(CRYPTO_KEY, { saltB64, iterations });

  const next = mergeDefaults(state || {}, defaultState());
  next.encryption.enabled = true;
  next.encryption.saltB64 = saltB64;
  next.encryption.iterations = iterations;
  next.__locked = false;
  next.__cryptoKey = key;

  await saveState(next);
  return next;
}

export async function unlockWithPassphrase(passphrase, statePreview) {
  const meta = (await idbGet(CRYPTO_KEY)) || null;
  const record = (await idbGet(STATE_KEY)) || null;
  if (!meta?.saltB64 || !record || record.type !== 'enc') throw new Error('Нет зашифрованных данных');

  const { key } = await deriveKeyFromPassphrase(passphrase, meta.saltB64, meta.iterations || 210000);
  const st = await decryptJson(key, record.enc);
  const next = mergeDefaults(st, defaultState());
  next.encryption.enabled = true;
  next.encryption.saltB64 = meta.saltB64;
  next.encryption.iterations = meta.iterations || next.encryption.iterations;
  next.__locked = false;
  next.__cryptoKey = key;

  // Preserve any UI-only fields from preview.
  if (statePreview?.cloud?.serverUrl && !next.cloud?.serverUrl) next.cloud.serverUrl = statePreview.cloud.serverUrl;

  return next;
}

export async function disableEncryption(state) {
  const st = mergeDefaults(state || {}, defaultState());
  st.encryption.enabled = false;
  st.__locked = false;
  delete st.__cryptoKey;
  await saveState(st, { noEncrypt: true });
  return st;
}

function loadLegacyLocalStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function migrateV1ToV2(v1) {
  const base = defaultState();
  const v2 = mergeDefaults(
    {
      version: 2,
      profile: v1.profile,
      consent: v1.consent,
      steps: v1.steps,
      geo: v1.geo,
      lastKnown: v1.lastKnown,
      dating: v1.dating
    },
    base
  );
  v2.encryption.enabled = false;
  v2.__locked = false;
  return v2;
}

function sanitizeState(state) {
  const st = mergeDefaults(state || {}, defaultState());
  // Never persist session-only key.
  delete st.__cryptoKey;
  delete st.__locked;
  return st;
}

function mergeDefaults(src, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(src) ? src : defaults;
  if (defaults && typeof defaults === 'object') {
    const out = { ...defaults };
    if (src && typeof src === 'object') {
      for (const k of Object.keys(out)) out[k] = mergeDefaults(src[k], out[k]);
      for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k];
    }
    return out;
  }
  return src === undefined ? defaults : src;
}
