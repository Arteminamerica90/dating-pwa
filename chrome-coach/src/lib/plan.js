// Нормализация ответа модели: режем лишнее, чиним типы, гарантируем предсказуемую схему.

const MAX_STEPS = 12;

const str = (v, max = 800) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function refsOf(step) {
  const raw =
    step?.highlight?.refs ||
    step?.refs ||
    step?.target?.refs ||
    (typeof step?.target === 'string' ? [step.target] : []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .map((r) => r.replace(/^#/, ''))
    .filter((r) => /^e\d{1,4}$/i.test(r))
    .slice(0, 6);
}

function selectorsOf(step) {
  const raw = step?.target?.selectors || step?.selectors || [];
  return Array.isArray(raw) ? raw.map((s) => str(s, 300)).filter(Boolean).slice(0, 4) : [];
}

function findTextOf(step) {
  const raw = step?.target?.findText || step?.findText || step?.anchorText;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((s) => str(s, 60)).filter(Boolean).slice(0, 4);
}

/** Чинит один шаг, возвращает null если шаг бессмысленный. */
export function normalizeStep(step, i) {
  if (!step || typeof step !== 'object') return null;
  const title = str(step.title || step.name || step.action, 160);
  const instruction = str(step.instruction || step.text || step.detail || title, 1200);
  if (!title && !instruction) return null;

  const refs = refsOf(step);
  const selectors = selectorsOf(step);
  const findText = findTextOf(step);
  if (!refs.length && !selectors.length && !findText.length && step.optional !== true) {
    // Шаг без цели бывает осмысленным («перетащите вправо»), но в схеме помечаем явно.
  }

  let pointer = null;
  const pRaw = step.pointer || step.click || step.highlight?.pointer;
  if (typeof pRaw === 'string' && /^e\d{1,4}$/i.test(pRaw.trim())) pointer = pRaw.trim().replace(/^#/, '');
  else if (pRaw && typeof pRaw === 'object' && pRaw.ref) pointer = String(pRaw.ref).replace(/^#/, '');

  return {
    index: i + 1,
    title: title || `Шаг ${i + 1}`,
    instruction,
    target: { refs, selectors, findText },
    pointer: pointer || refs[0] || null,
    hint: str(step.hint || step.note || step.why, 400),
    verify: str(step.verify || step.check || step.expected, 300),
    optional: step.optional === true,
  };
}

/**
 * Итоговый план — то, что рисует панель и content script.
 * ctx: { knownRefs: Set<string>, toolId, surface }
 */
export function normalizePlan(raw, ctx = {}) {
  const known = ctx.knownRefs instanceof Set ? ctx.knownRefs : null;
  const source = str(raw?.source, 20) || 'ai';
  const stepsRaw = Array.isArray(raw?.steps) ? raw.steps : [];
  const steps = [];
  let droppedRefs = 0;

  stepsRaw.slice(0, MAX_STEPS).forEach((s) => {
    const step = normalizeStep(s, steps.length);
    if (!step) return;
    if (known) {
      const before = step.target.refs.length;
      step.target.refs = step.target.refs.filter((r) => known.has(r));
      droppedRefs += before - step.target.refs.length;
      if (!step.target.refs.length) step.pointer = null;
      else if (step.pointer && !known.has(step.pointer)) step.pointer = step.target.refs[0];
    }
    if (!step.target.refs.length && step.target.findText.length) step.pointer = step.pointer || null;
    steps.push(step);
  });

  const unresolvable = steps.filter((s) => !s.target.refs.length && !s.target.findText.length && !s.target.selectors.length).length;

  return {
    source,
    toolId: str(raw?.toolId || ctx.toolId, 60) || null,
    toolName: str(raw?.toolName, 80),
    surface: ['web', 'desktop'].includes(raw?.surface) ? raw.surface : ctx.surface || 'web',
    goal: str(raw?.goal, 300),
    summary: str(raw?.summary, 500),
    assumptions: toList(raw?.assumptions, 6, 200),
    steps,
    pitfalls: toList(raw?.pitfalls, 6, 240),
    offerTool: normalizeToolCard(raw?.offerTool),
    quality: {
      steps: steps.length,
      droppedRefs,
      unresolvableSteps: unresolvable,
      grounded: steps.filter((s) => s.target.refs.length).length,
    },
  };
}

function toList(v, max, len) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => str(x, len)).filter(Boolean).slice(0, max);
}

/** ИИ может предложить новый инструмент — приму и предложу сохранить. */
export function normalizeToolCard(card) {
  if (!card || typeof card !== 'object' || !str(card.name, 80)) return null;
  const slug = str(card.id, 60) || str(card.name, 80).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
  return {
    id: slug,
    name: str(card.name, 80),
    kind: str(card.kind, 80),
    surfaces: {
      web: {
        label: str(card.webLabel, 80) || 'Веб-версия',
        urlPatterns: Array.isArray(card.urlPatterns) ? card.urlPatterns.map((p) => str(p, 200)).filter(Boolean).slice(0, 6) : [],
      },
      desktop: { label: str(card.desktopLabel, 80) || 'Настольная версия' },
    },
    topics: [],
  };
}
