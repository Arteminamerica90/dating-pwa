// Side panel: сценарий пользователя, рендер плана, подсветка, пикер элементов,
// реестр инструментов и настройки.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = null;
let plan = null;
let stepIndex = 0;
let lastTabId = null;

const EXAMPLES = [
  'Как делать маски в After Effects',
  'Слой-маска в Photoshop',
  'Auto layout в Figma',
  'Черновой монтаж в Premiere',
  'Коррекция цвета в DaVinci Resolve',
];

const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, payload });

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  lastTabId = tab?.id ?? lastTabId;
  return lastTabId;
}

async function sendTab(message) {
  const tabId = await activeTabId();
  if (!tabId) throw new Error('Нет активной вкладки');
  return chrome.tabs.sendMessage(tabId, message);
}

const setStatus = (text, kind = '') => {
  const node = $('#status');
  node.textContent = text;
  node.className = `status ${kind}`;
};

/* ------------------------------------------------------------------ старт */

async function refresh() {
  const res = await send('state');
  if (!res?.ok) return;
  state = res;

  const tab = res.tab || {};
  $('#tabInfo').textContent = tab.ok ? tab.title || tab.url : 'Активная вкладка — не веб-страница';

  fillTools(tab);
  fillSettings();
  renderTools();
  renderProviderState();
}

function fillTools(tab) {
  const sel = $('#tool');
  const prev = sel.value;
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Определить по странице';
  sel.appendChild(auto);
  for (const t of state.tools || []) {
    const o = document.createElement('option');
    o.value = t.id;
    const surfaces = Object.keys(t.surfaces || {}).map((s) => (s === 'web' ? 'веб' : 'наст.'));
    o.textContent = `${t.name}${surfaces.length ? ` · ${surfaces.join('+')}` : ''}`;
    sel.appendChild(o);
  }
  sel.value = prev && state.tools?.some((t) => t.id === prev) ? prev : '';

  const ntpTool = $('#ntp_tool');
  ntpTool.innerHTML = '';
  for (const t of state.tools || []) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    ntpTool.appendChild(o);
  }

  const ex = $('#examples');
  ex.innerHTML = '';
  for (const text of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = text;
    b.onclick = () => {
      $('#goal').value = text;
      ask();
    };
    ex.appendChild(b);
  }
}

function renderProviderState() {
  const s = state?.settings || {};
  const model = s.model || (s.provider === 'ollama' ? 'llama3.1' : s.provider === 'anthropic' ? 'claude' : 'gpt-4o-mini');
  $('#providerState').textContent = s.provider === 'none' ? 'режим: без ИИ' : `ИИ: ${model}`;
}

/* ----------------------------------------------------------------- плана */

async function ask() {
  const goal = $('#goal').value.trim();
  if (!goal) {
    setStatus('Опишите задачу — например, «хочу научиться делать маски в After Effects».', 'err');
    return;
  }
  const btn = $('#ask');
  btn.disabled = true;
  setStatus('Смотрю страницу и собираю каталог элементов…');

  try {
    const res = await send('ask', { goal, toolId: $('#tool').value || null, surface: $('#surface').value });
    if (!res?.ok) throw new Error(res?.error || 'неизвестная ошибка');
    plan = res.plan;
    stepIndex = 0;
    renderPlan();

    const ctx = plan.context || {};
    if (ctx.aiError) setStatus(`ИИ недоступен (${ctx.aiError.slice(0, 90)}) — показана инструкция из встроенной базы.`, 'err');
    else if (ctx.needsApiKey) setStatus('Ключ API не задан: инструкция собрана офлайн. Добавьте ключ в настройках.', 'err');
    else if (plan.source === 'local') setStatus('Ответ из встроенной базы (ИИ выключен или недоступен).');
    else setStatus(`Готово. Найдено элементов на странице: ${ctx.elementsFound ?? 0}.`, 'ok');

    if (state.settings.autoApply) await showOnPage(0);
  } catch (e) {
    setStatus(String(e.message || e), 'err');
  } finally {
    btn.disabled = false;
  }
}

function renderPlan() {
  $('#plan').hidden = false;
  $('#planTool').textContent = plan.toolName || plan.context?.toolDetected || 'Инструмент не определён';
  const q = plan.quality || {};
  const bits = [
    plan.surface === 'desktop' ? 'настольная версия' : 'веб-версия',
    `${q.steps || 0} шагов`,
    q.grounded ? `подсветка: ${q.grounded}` : 'подсветка недоступна',
    plan.source === 'local' ? 'офлайн-база' : 'ИИ',
  ];
  $('#planMeta').textContent = bits.join(' · ');
  $('#planSummary').textContent = plan.summary || '';

  const list = $('#steps');
  list.innerHTML = '';
  plan.steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'step';
    li.dataset.i = String(i);
    const grounded = s.target.refs.length || s.target.selectors.length || s.target.findText.length;
    li.innerHTML = `
      <div class="num">${i + 1}</div>
      <div>
        <div class="t"></div>
        <div class="d"></div>
        ${s.hint ? `<div class="h"></div>` : ''}
        ${s.verify ? `<div class="v"></div>` : ''}
        ${grounded ? '' : '<div class="ungrounded">Элемент не привязан — укажите его мышью</div>'}
      </div>`;
    li.querySelector('.t').textContent = s.title;
    li.querySelector('.d').textContent = s.instruction;
    if (s.hint) li.querySelector('.h').textContent = s.hint;
    if (s.verify) li.querySelector('.v').textContent = s.verify;
    li.onclick = () => applyStep(i);
    list.appendChild(li);
  });

  const extra = [...(plan.assumptions || []), ...(plan.pitfalls || []).map((p) => `Осторожно: ${p}`)];
  const box = $('#assumptions');
  if (extra.length) {
    box.hidden = false;
    $('#assumptionsBody').innerHTML = `<ul>${extra.map((t) => `<li></li>`).join('')}</ul>`;
    [...$('#assumptionsBody').querySelectorAll('li')].forEach((li, i) => (li.textContent = extra[i]));
  } else {
    box.hidden = true;
  }

  renderToolOffer();
  markActive();
  $('#prev').disabled = true;
  $('#next').disabled = plan.steps.length < 2;
}

function markActive() {
  $$('#steps .step').forEach((li) => li.classList.toggle('active', Number(li.dataset.i) === stepIndex));
  $('#prev').disabled = stepIndex <= 0;
  $('#next').disabled = stepIndex >= (plan?.steps.length || 0) - 1;
}

/**
 * Основной путь: отдаём весь план content script, а тот сам листает шаги
 * и рисует карточку прямо на странице. Панель в этом процессе не участвует.
 */
async function showOnPage(index) {
  if (!plan?.steps?.length) return;
  if (plan.surface === 'desktop') {
    stepIndex = Math.max(0, Math.min(index, plan.steps.length - 1));
    markActive();
    setStatus('Настольная версия: подсветить окно программы браузер не может. Шаг выделен в списке, инструкция — рядом.', 'err');
    return;
  }
  stepIndex = Math.max(0, Math.min(index, plan.steps.length - 1));
  markActive();
  try {
    const res = await sendTab({
      type: 'SHOW_PLAN',
      payload: {
        plan,
        startIndex: stepIndex,
        options: { dim: $('#dim').checked || state.settings.dimPage, voice: state.settings.voiceHints },
      },
    });
    if (res?.ok === false) {
      setStatus(`Не удалось показать шаг: ${res.reason || res.error || 'неизвестно'}`, 'err');
    } else {
      setStatus('Подсказки на странице. Кликайте по выделенному элементу или жмите «Далее» прямо в карточке.', 'ok');
    }
  } catch (e) {
    setStatus(`Подсветка недоступна: ${e.message || e}`, 'err');
  }
}

async function applyStep(i) {
  return showOnPage(i);
}

async function stopHighlight() {
  try {
    await sendTab({ type: 'STOP' });
  } catch { /* вкладка могла закрыться */ }
  setStatus('Подсказки убраны.');
}

/* ------------------------------------------------------------------ пикер */

let pickMode = false;

async function togglePick() {
  if (pickMode) {
    await sendTab({ type: 'PICK', payload: { on: false } }).catch(() => {});
    pickMode = false;
    $('#pick').textContent = 'Указать элемент мышью';
    setStatus('Режим указания выключен.');
    return;
  }
  try {
    await sendTab({ type: 'PICK', payload: { on: true } });
    pickMode = true;
    $('#pick').textContent = 'Отмена (Esc)';
    setStatus('Кликните мышью по нужному элементу на странице. Esc — отмена.');
  } catch (e) {
    setStatus(`Не удалось включить режим указания: ${e.message || e}`, 'err');
  }
}

function showPickHint() {
  if (pickMode) return;
  setStatus('Если интерфейс отличается от описанного — нажмите «Указать элемент мышью» и кликните по нужной кнопке.', 'err');
}

function renderPickCard(pick) {
  const card = $('#pickCard');
  card.hidden = false;
  const target = plan?.steps?.[stepIndex];
  card.innerHTML = `
    <div><b>Вы указали:</b> ${escapeHtml(pick.tag || '?')}${pick.id ? `#${pick.id}` : ''}</div>
    ${pick.aria ? `<div>aria-label: ${escapeHtml(pick.aria)}</div>` : ''}
    ${pick.text ? `<div>текст: ${escapeHtml(pick.text.slice(0, 70))}</div>` : ''}
    <div>место: ${escapeHtml(pick.breadcrumb || '—')}</div>
    <code>${escapeHtml(pick.selector || '')}</code>
    <div class="form">
      <label>Название шага<input id="pk_title" type="text" value="${escapeHtml(target?.title || pick.text?.slice(0, 40) || 'Переход к элементу')}"></label>
      <label>Что сделать<input id="pk_text" type="text" value="${escapeHtml(target?.instruction || `Нажмите «${pick.aria || pick.text || pick.tag}»`)}"></label>
      <div class="actions">
        ${target ? '<button id="pk_bind" class="primary small">Привязать к текущему шагу</button>' : ''}
        <button id="pk_save" class="ghost small">Сохранить в базу инструмента</button>
        <button id="pk_close" class="ghost small">Скрыть</button>
      </div>
    </div>`;

  $('#pk_close').onclick = () => (card.hidden = true);
  $('#pk_bind')?.addEventListener('click', () => {
    const step = plan.steps[stepIndex];
    step.target = { refs: [], selectors: [pick.selector], findText: pick.text ? [pick.text.slice(0, 40)] : [] };
    step.pointer = null;
    card.hidden = true;
    renderPlan();
    applyStep(stepIndex);
    setStatus('Шаг привязан к этому элементу. Можно сохранить инструмент, чтобы привязка не потерялась.', 'ok');
  });
  $('#pk_save').addEventListener('click', () => savePickToRegistry(pick));
}

/** Сохраняем шаг в реестр инструмента + привязку в базу знаний. */
async function savePickToRegistry(pick) {
  const toolId = $('#ntp_tool').value || $('#tool').value || plan?.toolId || state.tools?.[0]?.id;
  const tool = state.tools.find((t) => t.id === toolId);
  if (!tool) {
    setStatus('Сначала добавьте инструмент в реестр.', 'err');
    return;
  }
  const title = $('#pk_title').value.trim() || pick.text?.slice(0, 40) || 'Переход к элементу';
  const instruction = $('#pk_text').value.trim() || `Нажмите «${pick.aria || pick.text || pick.tag}»`;
  const topicId = `${tool.id}-user`;

  const next = structuredClone(tool);
  next.topics = [...(next.topics || [])];
  let topic = next.topics.find((t) => t.id === topicId);
  if (!topic) {
    topic = { id: topicId, title: 'Мои шаги', keywords: [], steps: [] };
    next.topics.push(topic);
  }
  const stepIndexLocal = topic.steps.length;
  topic.steps.push({
    title,
    instruction,
    hint: `Иконка/кнопка: ${pick.aria || pick.text || pick.tag}. Путь: ${pick.breadcrumb || '—'}`,
    verify: 'Интерфейс перешёл дальше.',
    target: { selectors: [pick.selector], findText: pick.text ? [pick.text.slice(0, 40)] : [] },
  });

  await send('saveTool', next);
  await send('saveBinding', { toolId: tool.id, topicId, stepIndex: stepIndexLocal, target: { selectors: [pick.selector] } });
  await refresh();
  $('#pickCard').hidden = true;
  setStatus(`Сохранено в «${tool.name} → Мои шаги». В следующий раз ИИ привяжет шаг к этому элементу автоматически.`, 'ok');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------ предложение ИИ */

function renderToolOffer() {
  const card = $('#toolOffer');
  const offer = plan?.offerTool;
  if (!offer) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  card.innerHTML = `
    <div><b>Новый инструмент:</b> ${escapeHtml(offer.name)} ${offer.kind ? `· ${escapeHtml(offer.kind)}` : ''}</div>
    <div>Добавить его в список инструментов, чтобы в следующий раз он определялся автоматически?</div>
    <div class="actions"><button id="offer_save" class="primary small">Добавить</button><button id="offer_skip" class="ghost small">Не сейчас</button></div>`;
  $('#offer_skip').onclick = () => (card.hidden = true);
  $('#offer_save').onclick = async () => {
    await send('saveTool', { ...offer, topics: plan.offerTool.topics || [] });
    await refresh();
    card.hidden = true;
    setStatus(`«${offer.name}» добавлен в список инструментов.`, 'ok');
  };
}

/* ------------------------------------------------------- инструменты */

function renderTools() {
  const box = $('#toolsList');
  box.innerHTML = '';
  for (const tool of state.tools || []) {
    const div = document.createElement('div');
    div.className = 'tool';
    const isUser = (tool.sources || []).includes('user');
    const surfaces = Object.entries(tool.surfaces || {})
      .map(([k, v]) => `<span class="pill">${k === 'web' ? 'веб' : 'наст.'}</span>`)
      .join('');
    div.innerHTML = `
      <header>
        <span class="name"></span>
        <span class="kind"></span>
        <span class="grow"></span>
        ${surfaces}
        ${isUser ? '<span class="pill user">моё</span>' : ''}
        ${isUser ? '<button class="ghost small tool_del">Удалить</button>' : ''}
      </header>
      <div class="topics"></div>`;
    div.querySelector('.name').textContent = tool.name;
    div.querySelector('.kind').textContent = tool.kind || '';
    div.querySelector('header').onclick = (e) => {
      if (e.target.closest('button')) return;
      const topics = div.querySelector('.topics');
      topics.hidden = !topics.hidden;
    };
    div.querySelector('.tool_del')?.addEventListener('click', async () => {
      if (!confirm(`Удалить «${tool.name}» из списка?`)) return;
      await send('deleteTool', { id: tool.id });
      await refresh();
    });

    const topics = div.querySelector('.topics');
    for (const topic of tool.topics || []) {
      const t = document.createElement('div');
      t.className = 'topic';
      t.innerHTML = `<div class="tt"></div><ul>${(topic.steps || []).map(() => '<li></li>').join('')}</ul>`;
      t.querySelector('.tt').textContent = `${topic.title} · ${(topic.keywords || []).join(', ') || 'без ключевых слов'}`;
      [...t.querySelectorAll('li')].forEach((li, i) => (li.textContent = topic.steps[i].title));
      topics.appendChild(t);
    }
    box.appendChild(div);
  }
}

/* ----------------------------------------------------------- настройки */

function fillSettings() {
  const s = state.settings;
  $('#st_provider').value = s.provider;
  $('#st_base').value = s.baseUrl || '';
  $('#st_model').value = s.model || '';
  $('#st_key').value = s.apiKey || '';
  $('#st_limit').value = s.catalogLimit;
  $('#st_auto').checked = !!s.autoApply;
  $('#st_dim').checked = !!s.dimPage;
  $('#st_voice').checked = !!s.voiceHints;
  $('#surface').value = s.surface || 'web';
  $('#dim').checked = !!s.dimPage;
}

async function saveSettings() {
  const settings = await send('settings', {
    provider: $('#st_provider').value,
    baseUrl: $('#st_base').value.trim(),
    model: $('#st_model').value.trim(),
    apiKey: $('#st_key').value.trim(),
    catalogLimit: Number($('#st_limit').value) || 240,
    autoApply: $('#st_auto').checked,
    dimPage: $('#st_dim').checked,
    voiceHints: $('#st_voice').checked,
    surface: $('#surface').value,
  });
  state.settings = settings.settings;
  renderProviderState();
  $('#st_note').textContent = 'Сохранено.';
  $('#st_note').className = 'note ok';
}

async function testAi() {
  const note = $('#st_note');
  note.textContent = 'Проверяю…';
  note.className = 'note';
  const res = await send('testAi');
  note.textContent = res.ok ? `OK. Модель: ${res.model}` : `Ошибка: ${res.error}`;
  note.className = `note ${res.ok ? 'ok' : 'err'}`;
}

/* --------------------------------------------------------- редактор шага */

function addStepRow() {
  const box = $('#ntp_steps');
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `
    <input class="s_title" type="text" placeholder="Название шага" />
    <input class="s_text" type="text" placeholder="Что сделать" />
    <input class="s_find" type="text" placeholder="Текст кнопки/панели для подсветки (необязательно)" />
    <button class="ghost small s_del">Убрать</button>`;
  row.querySelector('.s_del').onclick = () => row.remove();
  box.appendChild(row);
}

async function saveNewTool() {
  const name = $('#nt_name').value.trim();
  if (!name) {
    setStatus('Укажите название инструмента.', 'err');
    return;
  }
  const id = name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
  await send('saveTool', {
    id,
    name,
    kind: $('#nt_kind').value.trim(),
    sources: ['user'],
    surfaces: {
      web: { label: $('#nt_weblabel').value.trim() || 'Веб-версия', urlPatterns: $('#nt_url').value.trim() ? [$('#nt_url').value.trim()] : [] },
      desktop: { label: 'Настольная версия' },
    },
    topics: [],
  });
  $('#nt_name').value = '';
  $('#nt_kind').value = '';
  $('#nt_url').value = '';
  await refresh();
  $('#nt_weblabel').value = '';
  setStatus(`Инструмент «${name}» добавлен. Выберите его в поле «Инструмент» или попросите ИИ добавить автоматически.`, 'ok');
}

async function saveNewTopic() {
  const toolId = $('#ntp_tool').value;
  const tool = state.tools.find((t) => t.id === toolId);
  if (!tool) return;
  const title = $('#ntp_title').value.trim();
  if (!title) {
    setStatus('Укажите название темы.', 'err');
    return;
  }
  const steps = $$('#ntp_steps .step-row')
    .map((row) => ({
      title: row.querySelector('.s_title').value.trim(),
      instruction: row.querySelector('.s_text').value.trim(),
      target: { findText: row.querySelector('.s_find').value.trim() ? [row.querySelector('.s_find').value.trim()] : [] },
    }))
    .filter((s) => s.title || s.instruction);
  if (!steps.length) {
    setStatus('Добавьте хотя бы один шаг.', 'err');
    return;
  }

  const next = structuredClone(tool);
  next.topics = [...(next.topics || [])];
  const id = `${toolId}-${title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '')}`;
  next.topics.push({ id, title, keywords: $('#ntp_keywords').value.split(',').map((s) => s.trim()).filter(Boolean), steps });
  await send('saveTool', next);
  $('#ntp_title').value = '';
  $('#ntp_keywords').value = '';
  $('#ntp_steps').innerHTML = '';
  await refresh();
  setStatus(`Тема «${title}» сохранена в «${tool.name}». Теперь работает офлайн-режим по этим словам.`, 'ok');
}

/* ------------------------------------------------------------------ вкладки */

function switchTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.pane').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
}

/* ------------------------------------------------------------------- события */

$('#ask').onclick = ask;
$('#prev').onclick = () => applyStep(stepIndex - 1);
$('#next').onclick = () => applyStep(stepIndex + 1);
$('#stop').onclick = stopHighlight;
$('#pick').onclick = togglePick;
$('#dim').onchange = () => applyStep(stepIndex);
$('#st_save').onclick = saveSettings;
$('#st_test').onclick = async () => {
  await saveSettings();
  testAi();
};
$('#nt_save').onclick = saveNewTool;
$('#ntp_save').onclick = saveNewTopic;
$('#ntp_add').onclick = addStepRow;

$$('.tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

$('#goal').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask();
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (!plan) return;
  if (e.key === 'ArrowRight') applyStep(stepIndex + 1);
  if (e.key === 'ArrowLeft') applyStep(stepIndex - 1);
  if (e.key === 'Escape') stopHighlight();
});

chrome.runtime.onMessage.addListener(async (msg) => {
  // Пользователь идёт по шагам прямо на странице — панель только подстраивает список.
  if (msg?.type === 'COACH_STEP') {
    stepIndex = Math.max(0, Math.min(msg.payload.index || 0, (plan?.steps.length || 1) - 1));
    markActive();
    const step = plan?.steps?.[stepIndex];
    const li = $(`#steps .step[data-i="${stepIndex}"]`);
    li?.scrollIntoView({ block: 'nearest' });
    if (msg.payload.ok === false) setStatus(`Шаг ${stepIndex + 1}: элемент не найден на странице. ${step?.title || ''}`, 'err');
    return;
  }
  if (msg?.type === 'COACH_DONE') {
    markActive();
    setStatus(msg.payload?.done ? 'План пройден. Можно задать следующий вопрос.' : 'Подсказки убраны.', 'ok');
    return;
  }
  if (msg?.type !== 'COACH_PICK_READY') return;

  await refresh();
  if (state?.lastPick) renderPickCard(state.lastPick);
  pickMode = false;
  $('#pick').textContent = 'Указать элемент мышью';
  setStatus('Элемент пойман. Привяжите его к шагу или сохраните в базу инструмента.', 'ok');
});

addStepRow();
refresh().then(() => {
  $('#ntp_tool').value = state?.tools?.[0]?.id || '';
});
