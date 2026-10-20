// Service worker: маршрутизация сообщений между панелью и content script, сбор контекста страницы, вызов ИИ.

import * as reg from './lib/registry.js';
import { callAI, extractJson, offlinePlan, groundByText } from './lib/ai.js';
import { normalizePlan } from './lib/plan.js';

const CONTENT_FILE = 'src/content/coach.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});
});

/** Отправка в content script с авто-инжектом, если скрипт ещё не был загружен на этой вкладке. */
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_FILE] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function toolMatchesUrl(tool, url) {
  const patterns = tool.surfaces?.web?.urlPatterns || [];
  return patterns.some((p) => globToRegex(p).test(url));
}

const STOP_WORDS = new Set(['adobe', 'pro', 'the', 'and', 'app', 'version', 'software', 'вэб', 'версия']);

/** Слова-приметы инструмента: id целиком + значимые слова названия. */
function toolTokens(tool) {
  const out = new Set();
  const idPhrase = String(tool.id || '').replace(/-/g, ' ').trim();
  if (idPhrase.length >= 4) out.add(idPhrase);
  const name = String(tool.name || '').toLowerCase();
  if (name.length >= 4) out.add(name);
  for (const w of name.split(/[^a-zа-я0-9]+/)) {
    if (w.length >= 6 && !STOP_WORDS.has(w)) out.add(w);
  }
  return [...out];
}

/**
 * Определяем инструмент по URL (шаблоны реестра), заголовку вкладки и сигналам страницы
 * (meta generator / og:site_name / application-name / id элементов).
 */
function detectTool(registry, page, signals) {
  const signalsHay = [signals?.generator, signals?.app, signals?.ogSite].filter(Boolean).join(' ');
  const hay = `${page.url || ''} ${page.title || ''} ${signalsHay}`.toLowerCase();
  const idsHay = (signals?.ids || '').toLowerCase();

  const scored = registry.map((tool) => {
    let score = 0;
    if (toolMatchesUrl(tool, page.url || '')) score += 5;
    for (const token of toolTokens(tool)) {
      if (hay.includes(token)) score += 3;
      else if (idsHay.includes(token)) score += 2;
    }
    return { tool, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 2 ? scored[0].tool : null;
}

/** Собирает всё, что нужно для промпта, с активной вкладки. */
async function collectContext(surface) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ctx = { tab, page: { url: tab?.url || '', title: tab?.title || '' }, catalog: [], detected: null, readable: false };
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) return ctx;

  if (surface === 'desktop') return ctx;

  try {
    const info = await sendToTab(tab.id, { type: 'PING' });
    ctx.readable = !!info?.ok;
    const settings = await reg.getSettings();
    const info2 = await sendToTab(tab.id, { type: 'CATALOG', limit: settings.catalogLimit || 240 });
    ctx.catalog = info2?.catalog || [];
    ctx.markers = info2?.markers || null;
    ctx.page = { url: info?.url || ctx.page.url, title: info?.title || ctx.page.title };
  } catch (e) {
    ctx.error = String(e?.message || e);
  }
  return ctx;
}

async function handleAsk({ goal, toolId, surface }) {
  const settings = await reg.getSettings();
  const registry = await reg.getRegistry();
  const ctx = await collectContext(surface);

  const detected = detectTool(registry, ctx.page, ctx.markers);
  const tool = (toolId && registry.find((t) => t.id === toolId)) || detected || null;
  ctx.detected = detected;
  ctx.tool = tool;

  const kb = await reg.getKB();

  let plan = null;
  let error = null;
  try {
    const { raw } = await callAI(settings, {
      goal,
      tool,
      surface,
      catalog: ctx.catalog,
      page: ctx.page,
      kb: Object.fromEntries(Object.entries(kb).map(([k, v]) => [k, v])),
    });
    const parsed = extractJson(raw);
    if (!parsed) throw new Error('Модель вернула нечитаемый JSON');
    plan = normalizePlan(parsed, { knownRefs: new Set(ctx.catalog.map((c) => c.ref)), surface, toolId: tool?.id });
  } catch (e) {
    error = String(e?.message || e);
    plan = offlinePlan({ goal, catalog: ctx.catalog, tool, surface }, registry);
  }

  // Шаги, у которых нет ref, но есть текст/селекторы, привязываем к каталогу.
  if (ctx.catalog.length) groundByText(plan, ctx.catalog);

  // Подтверждённые пользователем привязки — высший приоритет.
  const kbTool = tool ? kb[tool.id] : null;
  if (kbTool) {
    for (const [topicId, bindings] of Object.entries(kbTool)) {
      for (const [stepKey, target] of Object.entries(bindings)) {
        const step = plan.steps[Number(stepKey)];
        if (!step || typeof target !== 'object') continue;
        const refs = (target.selectors || []).filter(Boolean);
        if (!refs.length) continue;
        const hit = ctx.catalog.find((c) => refs.includes(c.id) || refs.includes(c.selector));
        if (hit) {
          step.target.refs = [hit.ref];
          step.pointer = hit.ref;
        }
      }
    }
  }

  plan.context = {
    toolDetected: detected?.name || null,
    surface,
    pageUrl: ctx.page.url,
    elementsFound: ctx.catalog.length,
    aiError: error,
    needsApiKey: settings.provider !== 'none' && !settings.apiKey && settings.provider !== 'ollama',
  };
  if (tool) {
    plan.toolId = plan.toolId || tool.id;
    plan.toolName = plan.toolName || tool.name;
  }

  await reg.cachePlan(goal, plan);
  return plan;
}

const handlers = {
  async state() {
    const [settings, tools, kb] = await Promise.all([reg.getSettings(), reg.getRegistry(), reg.getKB()]);
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    return {
      settings,
      tools,
      kb,
      tab: { id: tab?.id, url: tab?.url, title: tab?.title, ok: /^https?:/i.test(tab?.url || '') },
      lastPick: await reg.getLastPick(),
    };
  },

  async ask(payload) {
    return { plan: await handleAsk(payload) };
  },

  async settings(patch) {
    return { settings: await reg.setSettings(patch || {}) };
  },

  async saveTool(tool) {
    return { tool: await reg.saveTool(tool) };
  },

  async deleteTool({ id }) {
    await reg.deleteTool(id);
    return { ok: true };
  },

  async saveBinding({ toolId, topicId, stepIndex, target }) {
    return { kb: await reg.saveKBBinding(toolId, topicId, stepIndex, target) };
  },

  async pingTab({ tabId }) {
    const id = tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!id) return { ok: false, error: 'Нет активной вкладки' };
    try {
      return await sendToTab(id, { type: 'PING' });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  },

  async clearLastPick() {
    await chrome.storage.local.remove('lastPick');
    return { ok: true };
  },

  async testAi() {
    const settings = await reg.getSettings();
    if (settings.provider === 'none') return { ok: false, error: 'ИИ выключен (provider = none)' };
    try {
      const { raw, model } = await callAI(settings, {
        goal: 'Проверка связи. Ответь JSON-планом из одного шага.',
        tool: null,
        surface: 'web',
        catalog: [],
        page: {},
        kb: {},
      });
      return { ok: !!raw, model, preview: String(raw).slice(0, 200) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Отчёт content script о ходе шагов: панель просто подписывается.
  if (msg?.type === 'COACH_STEP' || msg?.type === 'COACH_DONE') {
    sendResponse({ ok: true });
    return false;
  }

  // Клик в режиме подсказки прилетает из content script.
  if (msg?.type === 'COACH_PICKED') {
    reg.setLastPick({ ...(msg.payload || {}), at: Date.now(), tabId: sender?.tab?.id ?? null });
    chrome.runtime.sendMessage({ type: 'COACH_PICK_READY' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  const fn = handlers[msg?.type];
  if (!fn) {
    sendResponse({ ok: false, error: `Неизвестное сообщение: ${msg?.type}` });
    return false;
  }
  fn(msg.payload ?? {}, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});
