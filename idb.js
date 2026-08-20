const DB_NAME = 'walkdate.db';
const DB_VERSION = 1;
const LS_KEY = 'walkdate.fallback.v1';
let idbFailed = false;

function openDb() {
  return new Promise((resolve, reject) => {
    if (idbFailed) return reject(new Error('IndexedDB blocked'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { idbFailed = true; reject(req.error); };
  });
}

export async function idbGet(key) {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly');
        const store = tx.objectStore('kv');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const all = JSON.parse(raw);
      return all[key] ?? null;
    } catch {
      return null;
    }
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    try {
      const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      all[key] = value;
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch {
      // last resort
    }
  }
}

export async function idbDel(key) {
  try {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    try {
      const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      delete all[key];
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch {
      // last resort
    }
  }
}
