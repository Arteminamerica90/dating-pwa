// Хранилище: настройки, реестр инструментов, база знаний по шагам.
// Встроенные инструменты лежат в data/tools.json, пользовательские — в chrome.storage.local
// и переживают обновление расширения.

const KEYS = {
  settings: 'settings',
  tools: 'tools',
  kb: 'kb',
  plans: 'plans',
  lastPick: 'lastPick',
};

export const DEFAULT_SETTINGS = {
  provider: 'openai', // openai | anthropic | ollama | none
  baseUrl: '',
  model: '',
  apiKey: '',
  surface: 'web', // web | desktop | both
  autoApply: true, // сразу подсвечивать первый шаг
  dimPage: false, // затемнять страницу вокруг подсветки
  voiceHints: false,
  catalogLimit: 240,
};

let seedCache = null;

async function seedTools() {
  if (seedCache) return seedCache;
  const res = await fetch(chrome.runtime.getURL('src/data/tools.json'));
  seedCache = await res.json();
  return seedCache;
}

export async function getSettings() {
  const got = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(got[KEYS.settings] || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

/**
 * Реестр инструментов: встроенные + пользовательские.
 * Темы с одинаковым id не дублируются — пользовательская версия темы заменяет встроенную,
 * поэтому пересохранение инструмента не размножает шаги при каждом вызове.
 */
export async function getRegistry() {
  const got = await chrome.storage.local.get(KEYS.tools);
  const user = got[KEYS.tools] || { tools: [] };
  const seed = await seedTools();
  const byId = new Map();
  for (const t of seed.tools || []) byId.set(t.id, { ...t, sources: [...new Set([...(t.sources || []), 'builtin'])] });
  for (const t of user.tools || []) {
    const prev = byId.get(t.id);
    byId.set(t.id, prev ? mergeTool(prev, t) : t);
  }
  return [...byId.values()];
}

function mergeTool(base, over) {
  const topics = new Map();
  for (const t of base.topics || []) topics.set(t.id, t);
  for (const t of over.topics || []) topics.set(t.id, t);
  return {
    ...base,
    ...over,
    surfaces: { ...(base.surfaces || {}), ...(over.surfaces || {}) },
    topics: [...topics.values()],
  };
}

export async function saveTool(tool) {
  const got = await chrome.storage.local.get(KEYS.tools);
  const store = got[KEYS.tools] || { tools: [] };
  const i = store.tools.findIndex((t) => t.id === tool.id);
  const entry = { ...tool, sources: [...new Set([...(tool.sources || []), 'user'])] };
  if (i >= 0) store.tools[i] = entry;
  else store.tools.push(entry);
  await chrome.storage.local.set({ [KEYS.tools]: store });
  return entry;
}

export async function deleteTool(id) {
  const got = await chrome.storage.local.get(KEYS.tools);
  const store = got[KEYS.tools] || { tools: [] };
  store.tools = store.tools.filter((t) => t.id !== id);
  await chrome.storage.local.set({ [KEYS.tools]: store });
}

/** База знаний: подтверждённые пользователем привязки «шаг → элемент». */
export async function getKB() {
  const got = await chrome.storage.local.get(KEYS.kb);
  return got[KEYS.kb] || {};
}

export async function saveKBBinding(toolId, topicId, stepIndex, target) {
  const kb = await getKB();
  const tool = (kb[toolId] ||= {});
  const topic = (tool[topicId] ||= {});
  topic[stepIndex] = { ...(topic[stepIndex] || {}), ...target, updatedAt: Date.now() };
  await chrome.storage.local.set({ [KEYS.kb]: kb });
  return kb;
}

export async function getLastPick() {
  const got = await chrome.storage.local.get(KEYS.lastPick);
  return got[KEYS.lastPick] || null;
}

export async function setLastPick(pick) {
  await chrome.storage.local.set({ [KEYS.lastPick]: pick });
}

export async function cachePlan(goal, plan) {
  const got = await chrome.storage.local.get(KEYS.plans);
  const store = got[KEYS.plans] || { items: [] };
  store.items = [{ goal, at: Date.now(), plan }, ...store.items].slice(0, 30);
  await chrome.storage.local.set({ [KEYS.plans]: store });
}
