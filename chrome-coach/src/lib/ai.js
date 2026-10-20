// Слой ИИ: сборка промпта, вызов провайдера, разбор ответа и офлайн-фолбэк.
// Ключи не хранятся в коде — только в chrome.storage.local, запрос идёт из service worker.

import { normalizePlan } from './plan.js';

export const SYSTEM_PROMPT = `Ты — «UI Coach», помощник по интерфейсам профессиональных инструментов (монтаж, дизайн, 3D, аналитика, IDE).
Тебе дают: цель пользователя, выбранный инструмент, поверхность (веб-версия в браузере или настольная) и КАТАЛОГ ЭЛЕМЕНТОВ текущей страницы.
КАТАЛОГ — единственный источник правды о том, что реально есть на экране. Не выдумывай селекторы и классы.

Правила:
1. Если цель про поверхность настольного приложения (desktop) — подсветить интерфейс в браузере невозможно. Дай точные текстовые шаги, в каждом шаге в поле "hint" напиши, где искать в окне приложения, и упомяни веб-версию как альтернативу.
2. Для веб-версии подсвечивай элементы ТОЛЬКО по ref из каталога (например "e42"). Если нужного элемента в каталоге нет — не выдумывай ref, а опиши шаг словами и в "verify" скажи, что проверить вручную.
3. Один шаг — одно действие. 3–8 шагов. Порядок — реальный порядок работы в интерфейсе.
4. Язык — русский, обращение на «вы», коротко и по делу. Без воды и без markdown-заголовков.
5. "instruction" — что сделать. "hint" — как выглядит нужный элемент и где он находится. "verify" — по чему понять, что шаг выполнен.
6. Ничего не выполняй сам: пользователь всё делает руками на реальном интерфейсе.

Верни ТОЛЬКО JSON (без markdown) по схеме:
{
  "toolId": "id-инструмента-из-реестра-или-null",
  "toolName": "название инструмента",
  "surface": "web" | "desktop",
  "goal": "цель одной строкой",
  "summary": "1–2 предложения о том, что получится",
  "assumptions": ["допущения, которые стоит проговорить"],
  "steps": [
    {
      "title": "короткое название шага",
      "instruction": "что сделать, императив",
      "highlight": { "refs": ["e42"] },
      "pointer": "e42",
      "hint": "как найти элемент",
      "verify": "признак выполнения",
      "optional": false
    }
  ],
  "pitfalls": ["типичные ошибки"],
  "offerTool": null | { "id": "slug", "name": "Название", "kind": "тип", "urlPatterns": ["*://*.site.com/*"] }
}
offerTool заполняй только если инструмента не было в реестре и его веб-версия открыта в браузере.`;

export function buildUserPrompt(ctx) {
  const { goal, tool, surface, catalog, page, kb } = ctx;
  const lines = [];
  lines.push(`ЦЕЛЬ ПОЛЬЗОВАТЕЛЯ: ${goal}`);
  lines.push(`ПОВЕРХНОСТЬ: ${surface === 'desktop' ? 'настольное приложение (подсветка в браузере недоступна)' : 'веб-версия, открыта в браузере'}`);
  if (tool) {
    lines.push(`ИНСТРУМЕНТ: ${tool.name}${tool.kind ? ` (${tool.kind})` : ''}`);
    if (tool.surfaces?.desktop && surface === 'desktop') {
      lines.push(`ОКНО ПРИЛОЖЕНИЯ: ${tool.surfaces.desktop.label}${tool.surfaces.desktop.note ? `. ${tool.surfaces.desktop.note}` : ''}`);
    }
  } else {
    lines.push('ИНСТРУМЕНТ: не выбран, определи сам по цели и странице.');
  }
  if (page?.url) lines.push(`СТРАНИЦА: ${page.title || ''} — ${page.url}`);
  if (kb && Object.keys(kb).length) lines.push(`ПОДТВЕРЖДЁННЫЕ ПРИВЯЗКИ ЭЛЕМЕНТОВ (проверь их в первую очередь): ${JSON.stringify(kb).slice(0, 2500)}`);

  lines.push('');
  lines.push(`КАТАЛОГ ЭЛЕМЕНТОВ СТРАНИЦЫ (${catalog.length} шт., ref | тег | текст | aria | роль | координаты):`);
  lines.push(catalog.length ? catalog.map(catalogLine).join('\n') : '(пусто — элементы не найдены, опиши шаги словами)');
  return lines.join('\n');
}

function catalogLine(it) {
  const bits = [
    it.ref.padEnd(6),
    (it.tag || '').padEnd(8),
    `text="${(it.text || '').slice(0, 48)}"`,
    it.aria ? `aria="${it.aria.slice(0, 48)}"` : '',
    it.role ? `role=${it.role}` : '',
    it.id ? `id=${it.id.slice(0, 32)}` : '',
    it.testid ? `testid=${it.testid.slice(0, 32)}` : '',
    `xy=${Math.round(it.rect?.x ?? 0)},${Math.round(it.rect?.y ?? 0)} ${Math.round(it.rect?.w ?? 0)}x${Math.round(it.rect?.h ?? 0)}`,
  ];
  return bits.filter(Boolean).join(' | ');
}

/** Универсальный разбор: чистим ```json fences, вытаскиваем внешний объект. */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

export async function callAI(settings, ctx) {
  const provider = settings.provider || 'openai';
  if (provider === 'none') throw new Error('ИИ выключен (provider=none)');

  const user = buildUserPrompt(ctx);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];

  if (provider === 'openai') {
    const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = settings.model || 'gpt-4o-mini';
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey || ''}` },
      body: JSON.stringify({ model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { raw: data?.choices?.[0]?.message?.content ?? '', model };
  }

  if (provider === 'anthropic') {
    const base = (settings.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const model = settings.model || 'claude-3-5-haiku-latest';
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 3000, temperature: 0.2, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { raw: data?.content?.[0]?.text ?? '', model };
  }

  if (provider === 'ollama') {
    const base = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    const model = settings.model || 'llama3.1';
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, format: 'json', options: { temperature: 0.2 } }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { raw: data?.message?.content ?? '', model };
  }

  throw new Error(`Неизвестный провайдер: ${provider}`);
}

/**
 * Офлайн-режим: без сети и без ключа. Берём подходящую тему из реестра,
 * а цели привязываем к элементам по тексту через каталог страницы.
 */
export function offlinePlan(ctx, registry) {
  const { goal, catalog, tool, surface } = ctx;
  const g = String(goal || '').toLowerCase();
  let best = null;

  for (const t of registry) {
    for (const topic of t.topics || []) {
      const kws = (topic.keywords || []).map((k) => k.toLowerCase());
      const score = kws.reduce((n, k) => n + (g.includes(k) ? 1 : 0), 0) + (titleHit(g, topic.title) ? 1 : 0);
      if (!score) continue;
      if (!best || score > best.score) best = { score, tool: t, topic };
    }
  }

  if (!best) {
    const guess = guessToolName(goal, registry);
    return normalizePlan(
      {
        source: 'local',
        toolName: guess || 'Инструмент',
        surface,
        goal,
        summary: 'Офлайн-режим: точной инструкции в базе нет. Показываю элементы, подходящие по тексту запроса, и общие подсказки.',
        assumptions: ['Работает без ИИ: инструкции берутся из встроенной базы по ключевым словам.'],
        steps: textOnlySteps(goal, catalog, 3),
        pitfalls: ['Добавьте ключ API или включите Ollama — тогда инструкции будут точнее и подсветка стабильнее.'],
      },
      { surface, toolId: tool?.id }
    );
  }

  const steps = (best.topic.steps || []).map((s) => ({
    title: s.title,
    instruction: s.instruction,
    highlight: { refs: [] },
    hint: s.hint,
    verify: s.verify,
    target: s.target,
    optional: s.optional,
  }));

  const raw = {
    source: 'local',
    toolId: best.tool.id,
    toolName: best.tool.name,
    surface,
    goal,
    summary: `Инструкция из встроенной базы: «${best.topic.title}» — ${best.tool.name}.`,
    assumptions: ['Взято из встроенной базы по ключевым словам, без ИИ.'],
    steps,
    pitfalls: [],
  };

  // Офлайн-план сразу привязываем к элементам страницы по тексту —
  // иначе подсветка появилась бы только после отдельного прохода в background.
  return groundByText(normalizePlan(raw, { surface, toolId: best.tool.id }), catalog || []);
}

function titleHit(g, title) {
  const words = String(title || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter((w) => w.length > 3);
  return words.some((w) => g.includes(w)) ? 1 : 0;
}

function guessToolName(goal, registry) {
  const g = String(goal || '').toLowerCase();
  const hit = registry.find((t) => t.name.toLowerCase().split(' ').some((w) => w.length > 3 && g.includes(w)));
  return hit ? hit.name : null;
}

function textOnlySteps(goal, catalog, max) {
  const matched = matchByText(catalog, String(goal).split(/\s+/).filter((w) => w.length > 3)).slice(0, max);
  if (!matched.length) {
    return [
      {
        title: 'Уточните инструмент и версию',
        instruction: `Баз знаний по запросу «${goal}» нет. Добавьте инструмент в реестр или подключите ИИ в настройках.`,
      },
    ];
  }
  return matched.map((m) => ({
    title: `Найдено: ${m.item.aria || m.item.text || m.item.tag}`,
    instruction: `Похожий элемент найден по слову «${m.needle}». Откройте его и продолжите по подсказкам инструмента.`,
    highlight: { refs: [m.item.ref] },
    pointer: m.item.ref,
    hint: `Тег ${m.item.tag}${m.item.role ? `, роль ${m.item.role}` : ''}.`,
    verify: 'Элемент открылся.',
  }));
}

/** Привязка шага к элементу по тексту: используется и офлайн, и для починки шагов без ref. */
export function matchByText(catalog, needles) {
  const list = (needles || []).map((n) => String(n).toLowerCase().trim()).filter((n) => n.length >= 3);
  if (!list.length || !catalog?.length) return [];
  const out = [];
  for (const needle of list) {
    let best = null;
    for (const item of catalog) {
      const hay = `${item.aria || ''} ${item.text || ''} ${item.title || ''} ${item.id || ''} ${item.testid || ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
      const textLen = (item.text || item.aria || '').length || 40;
      const score = 100 - Math.min(textLen, 100) + (item.aria ? 25 : 0) + (item.id ? 15 : 0) + (item.visible ? 5 : 0);
      if (!best || score > best.score) best = { item, score };
    }
    if (best) out.push({ needle, ...best });
  }
  return out;
}

/** Дописывает ref к шагам, у которых вместо ref есть текстовая привязка (findText/selectors). */
export function groundByText(plan, catalog) {
  if (!plan?.steps?.length) return plan;
  for (const step of plan.steps) {
    if (step.target.refs.length || !step.target.findText.length) continue;
    const hit = matchByText(catalog, step.target.findText)[0];
    if (hit) {
      step.target.refs = [hit.item.ref];
      if (!step.pointer) step.pointer = hit.item.ref;
    }
  }
  plan.quality.grounded = plan.steps.filter((s) => s.target.refs.length).length;
  return plan;
}
