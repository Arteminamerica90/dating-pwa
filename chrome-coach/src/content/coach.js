// Content script: строит каталог элементов страницы, рисует подсветку поверх реального интерфейса
// и умеет «снимать» элемент, по которому кликнул пользователь (режим подсказки для ИИ).
(() => {
  const NS = '__uiCoach';
  if (window[NS]) return;
  window[NS] = true;

  const state = {
    nodes: new Map(), // ref -> Element
    catalog: [],
    active: null,
    pick: false,
    hoverEl: null,
    raf: 0,
    pulseTimer: 0,
    root: null,
    // План, который ведёт сам content script: пользователю не нужно смотреть в панель.
    plan: null,
    index: 0,
    options: {},
    armedUntil: 0, // не считаем первый клик по элементу «проверкой»
    speaking: false,
  };

  const isEditable = (el) => /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable;

  /* ------------------------------------------------------------------ каталог */

  const CANDIDATE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[role]',
    '[contenteditable="true"]',
    '[aria-label]',
    '[data-testid]',
    '[data-test-id]',
    '[data-qa]',
    '[id]',
    '[title]',
    '[class*="btn" i]',
    '[class*="button" i]',
    '[class*="tool" i]',
    '[class*="tab" i]',
    '[class*="menu" i]',
    '[class*="nav" i]',
    '[class*="panel" i]',
    '[class*="item" i]',
    '[class*="item" i]',
    '[class*="option" i]',
    '[class*="card" i]',
    '[class*="icon" i]',
    '[tabindex]',
  ].join(',');

  const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'LABEL', 'OPTION']);
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'checkbox', 'radio',
    'switch', 'slider', 'textbox', 'combobox', 'listbox', 'treeitem', 'toolbar', 'menubar', 'tablist', 'grid',
  ]);

  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r;
  }

  function styleOk(el) {
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (Number(st.opacity) === 0) return false;
    return true;
  }

  function shortText(el) {
    const aria = el.getAttribute?.('aria-label') || '';
    const t = (aria || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 120);
  }

  function collectRoots() {
    const roots = [document.body];
    const walk = (root, depth) => {
      if (!root || depth > 3) return;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          roots.push(el.shadowRoot);
          walk(el.shadowRoot, depth + 1);
        }
      }
    };
    walk(document.body, 0);
    return roots.filter(Boolean);
  }

  function buildCatalog(limit = 240) {
    const roots = collectRoots();
    const cands = new Map();

    const add = (el) => {
      if (!el || el.nodeType !== 1 || cands.has(el)) return;
      const text = shortText(el);
      const aria = el.getAttribute('aria-label') || '';
      const role = el.getAttribute('role') || '';
      const tag = el.tagName;
      const interactive = INTERACTIVE_TAGS.has(tag) || INTERACTIVE_ROLES.has(role) || el.hasAttribute('tabindex') || isEditable(el);
      const named = !!(el.id || aria || el.getAttribute('data-testid') || el.getAttribute('title'));
      if (!interactive && !named && text.length < 2) return;
      if (text.length > 160 && !named) return;
      let score = 0;
      if (el.getAttribute('data-testid')) score += 40;
      if (el.id) score += 30;
      if (aria) score += 24;
      if (el.getAttribute('title')) score += 14;
      if (interactive) score += 18;
      if (role) score += 10;
      score += Math.min(text.length, 40) / 4;
      if (/^(input|textarea|select)$/i.test(tag)) score -= 8; // поля ввода засоряют каталог
      cands.set(el, { el, score, text, aria, role, tag: tag.toLowerCase() });
    };

    for (const root of roots) {
      let found;
      try {
        found = root.querySelectorAll(CANDIDATE_SELECTOR);
      } catch {
        continue;
      }
      const budget = 8000;
      for (let i = 0; i < Math.min(found.length, budget); i++) add(found[i]);

      // Листья с текстом — там живут подписи кнопок, названия панелей, пункты меню.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let n = 0;
      let node;
      while ((node = walker.nextNode()) && n < 6000) {
        const t = node.textContent.replace(/\s+/g, ' ').trim();
        if (t.length < 2 || t.length > 80) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent.childElementCount > 2) continue;
        add(parent);
        n++;
      }
    }

    const rows = [];
    for (const rec of cands.values()) {
      const r = visibleRect(rec.el);
      if (!r) continue;
      rows.push({ ...rec, rect: r });
    }
    rows.sort((a, b) => b.score - a.score || (a.text.length - b.text.length));

    const top = rows.slice(0, Math.min(rows.length, Math.max(limit * 2, 400)));
    const measured = [];
    for (const rec of top) {
      if (!styleOk(rec.el)) continue;
      measured.push(rec);
    }

    // Убираем «обёртки»: если у элемента ровно один элемент-ребёнок с тем же текстом — оставляем более глубокий.
    const pruned = measured.filter((rec) => {
      const kids = rec.el.children;
      if (kids.length !== 1) return true;
      const kid = kids[0];
      return !kid.textContent || kid.textContent.replace(/\s+/g, ' ').trim() !== rec.text || kid.children.length > 0;
    });

    const list = pruned.slice(0, limit);
    const catalog = [];
    state.nodes = new Map();
    list.forEach((rec, i) => {
      const ref = `e${i + 1}`;
      const el = rec.el;
      state.nodes.set(ref, el);
      catalog.push({
        ref,
        tag: rec.tag,
        id: el.id || '',
        aria: rec.aria || '',
        role: rec.role || '',
        text: rec.text.slice(0, 120),
        title: el.getAttribute('title') || '',
        testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '',
        selector: cssPath(el),
        visible: rec.rect.top < innerHeight && rec.rect.bottom > 0,
        rect: {
          x: Math.round(rec.rect.x),
          y: Math.round(rec.rect.y + scrollY),
          w: Math.round(rec.rect.width),
          h: Math.round(rec.rect.height),
        },
      });
    });
    state.catalog = catalog;
    return { catalog, total: cands.size };
  }

  /* --------------------------------------------------------- сигнатуры для ИИ */

  function cssPath(el, depth = 0) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id && document.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) return `#${cssEscape(el.id)}`;
    const testid = el.getAttribute?.('data-testid') || el.getAttribute?.('data-test-id');
    if (testid) return `[data-testid="${testid}"]`;
    const aria = el.getAttribute?.('aria-label');
    if (aria && depth < 3) return `${el.tagName.toLowerCase()}[aria-label="${aria.slice(0, 40)}"]`;
    if (depth > 5 || el.tagName === 'BODY') return el.tagName.toLowerCase();
    const cls = String(el.className || '')
      .trim()
      .split(/\s+/)
      .filter((c) => c && !/^(is-|has-|sc-|css-|jsx-|ember|ng-)/.test(c))
      .slice(0, 2);
    let part = el.tagName.toLowerCase();
    if (cls.length) part += `.${cls.map(cssEscape).join('.')}`;
    const parent = el.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
    }
    return `${part} > ${cssPath(parent, depth + 1)}`.replace(/ > (html|body)$/, '');
  }

  const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));

  function breadcrumb(el) {
    const parts = [];
    let cur = el;
    for (let i = 0; i < 4 && cur && cur.nodeType === 1; i++) {
      const label = cur.getAttribute('aria-label') || (cur.id && `#${cur.id}`) || shortText(cur).slice(0, 24);
      if (label) parts.unshift(label);
      cur = cur.parentElement;
    }
    return parts.join(' › ');
  }

  function signatureOf(el) {
    const r = el.getBoundingClientRect();
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      aria: el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      text: shortText(el).slice(0, 120),
      title: el.getAttribute('title') || '',
      testid: el.getAttribute('data-testid') || '',
      rect: { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      breadcrumb: breadcrumb(el),
      pageUrl: location.href,
      pageTitle: document.title,
    };
  }

  /* ----------------------------------------------------------------- оверлей */

  function ensureRoot() {
    if (state.root) return state.root;
    const root = document.createElement('div');
    root.id = 'ui-coach-overlay';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="uc-dim" hidden></div>
      <div class="uc-hover" hidden></div>
      <div class="uc-boxes"></div>
      <div class="uc-label" hidden></div>
      <div class="uc-cursor" hidden>
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l14 8.5-6.2 1.6L9.6 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>
      </div>
      <div class="uc-pulse" hidden></div>
      <div class="uc-tip" hidden></div>
      <div class="uc-card" hidden>
        <div class="uc-card-top">
          <span class="uc-card-step"></span>
          <span class="uc-card-tool"></span>
          <button class="uc-card-x" title="Скрыть подсказки" aria-label="Скрыть подсказки">&times;</button>
        </div>
        <div class="uc-card-title"></div>
        <div class="uc-card-text"></div>
        <div class="uc-card-hint" hidden></div>
        <div class="uc-card-check" hidden></div>
        <div class="uc-card-bar">
          <button class="uc-b uc-b-prev">&larr;</button>
          <div class="uc-dots"></div>
          <button class="uc-b uc-b-replay" title="Показать ещё раз">&#8635;</button>
          <button class="uc-b uc-b-next">Далее</button>
        </div>
        <div class="uc-card-cta">Кликните по выделенному элементу &mdash; перейдём дальше</div>
      </div>`;
    (document.body || document.documentElement).appendChild(root);
    root.style.zIndex = '2147483647';
    state.root = root;
    wireCard(root);
    return root;
  }

  /* ------------------------------------------------ карточка прямо на странице */

  function wireCard(root) {
    root.querySelector('.uc-b-next').onclick = () => advance(1);
    root.querySelector('.uc-b-prev').onclick = () => advance(-1);
    root.querySelector('.uc-b-replay').onclick = () => show(state.index, { replay: true });
    root.querySelector('.uc-card-x').onclick = () => stopAll();
  }

  function advance(dir) {
    if (!state.plan?.steps?.length) return;
    const next = state.index + dir;
    if (next < 0) return;
    if (next >= state.plan.steps.length) {
      stopAll({ done: true });
      return;
    }
    show(next);
  }

  /** Клик по настоящему элементу интерфейса = подтверждение шага, идём к следующему. */
  function onPageClick(e) {
    if (!state.plan || state.active?.opts?.passive) return;
    const path = e.composedPath?.() || [];
    const hit = state.active?.nodes?.some((n) => path.includes(n));
    if (!hit) return;
    if (Date.now() < state.armedUntil) return; // первый клик мог быть «замахом»
    setTimeout(() => advance(1), 550);
  }

  function stopAll(opts = {}) {
    document.removeEventListener('click', onPageClick, true);
    clearOverlay();
    stopSpeaking();
    const card = state.root && state.root.querySelector('.uc-card');
    if (card) card.hidden = true;
    state.plan = null;
    chrome.runtime.sendMessage({ type: 'COACH_DONE', payload: { done: !!opts.done } }).catch(() => {});
  }

  /* Голос читает шаг вслух — hands-free вариант, когда смотреть на текст неудобно. */
  function speak(step) {
    stopSpeaking();
    if (!state.options?.voice) return;
    try {
      const u = new SpeechSynthesisUtterance(`${step.title}. ${step.instruction}`);
      u.lang = 'ru-RU';
      u.rate = 1;
      state.speaking = speechSynthesis;
      speechSynthesis.speak(u);
    } catch { /* синтеза речи может не быть */ }
  }

  function stopSpeaking() {
    try {
      if (state.speaking && speechSynthesis.speaking) speechSynthesis.cancel();
    } catch { /* нет API */ }
    state.speaking = false;
  }

  const el = (sel) => ensureRoot().querySelector(sel);

  function place(node, rect, pad = 0) {
    node.style.left = `${rect.left - pad}px`;
    node.style.top = `${rect.top - pad}px`;
    node.style.width = `${rect.width + pad * 2}px`;
    node.style.height = `${rect.height + pad * 2}px`;
  }

  function drawHighlights(rects, opts = {}) {
    const boxes = el('.uc-boxes');
    boxes.innerHTML = '';
    rects.forEach((r, i) => {
      const b = document.createElement('div');
      b.className = 'uc-box' + (i === 0 ? ' uc-box-main' : '');
      place(b, r, 4);
      boxes.appendChild(b);
    });
    const dim = el('.uc-dim');
    if (opts.dim && rects[0]) {
      const r = rects[0];
      place(dim, r, 6);
      dim.style.borderRadius = `${Math.min(12, r.height / 4)}px`;
      dim.hidden = false;
    } else {
      dim.hidden = true;
    }

    const label = el('.uc-label');
    if (opts.label) {
      const first = rects[0];
      const above = first ? first.top > 42 : true;
      label.textContent = opts.label;
      label.hidden = false;
      if (first) {
        label.style.transform = 'none';
        label.style.left = `${Math.max(8, Math.min(innerWidth - 340, first.left))}px`;
        label.style.top = above ? `${first.top - 46}px` : `${first.bottom + 12}px`;
        label.style.maxWidth = '330px';
      } else {
        label.style.transform = 'translateX(-50%)';
        label.style.left = '50%';
        label.style.top = '24px';
      }
    } else {
      label.hidden = true;
    }
  }

  /**
   * Анимацию курсора запускаем один раз на шаг, а не каждый кадр — иначе она бы перезапускалась.
   * Покойное состояние задаёт CSS: если анимация не проигралась (headless, throttling,
   * prefers-reduced-motion), курсор всё равно останется видимым на цели.
   */
  function moveCursor(point, animate) {
    const cur = el('.uc-cursor');
    const pulse = el('.uc-pulse');
    if (!point) {
      cur.hidden = true;
      pulse.hidden = true;
      return;
    }
    cur.hidden = false;
    cur.style.left = `${point.x - 4}px`;
    cur.style.top = `${point.y - 2}px`;
    pulse.hidden = false;
    pulse.style.left = `${point.x - 6}px`;
    pulse.style.top = `${point.y - 6}px`;
    if (!animate) return;

    cur.classList.remove('uc-cursor-fly');
    cur.getAnimations?.().forEach((a) => a.cancel());
    cur.animate(
      [
        { transform: 'translate(-140px, -110px) scale(.9)', opacity: 0 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );

    // Несколько «всплесков», затем неподвижное кольцо: точка клика остаётся читаемой.
    clearTimeout(state.pulseTimer);
    pulse.classList.remove('uc-pulse-end');
    pulse.getAnimations?.().forEach((a) => a.cancel());
    pulse.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(3.2)', opacity: 0 }], {
      duration: 1200,
      iterations: 3,
      easing: 'ease-out',
    });
    state.pulseTimer = setTimeout(() => pulse.classList.add('uc-pulse-end'), 3700);
  }

  function clearOverlay() {
    state.active = null;
    clearTimeout(state.pulseTimer);
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (!state.root) return;
    el('.uc-boxes').innerHTML = '';
    el('.uc-dim').hidden = true;
    el('.uc-label').hidden = true;
    el('.uc-cursor').hidden = true;
    el('.uc-pulse').hidden = true;
    el('.uc-tip').hidden = true;
  }

  /* --------------------------------------------------------- поиск элементов */

  function nodeForRef(ref) {
    let node = state.nodes.get(ref);
    if (node && node.isConnected) return node;
    const item = state.catalog.find((c) => c.ref === ref);
    if (item?.selector) {
      try {
        const found = document.querySelector(item.selector);
        if (found) {
          state.nodes.set(ref, found);
          return found;
        }
      } catch { /* невалидный селектор — пропускаем */ }
    }
    return null;
  }

  function findBySelector(selector) {
    let found;
    try {
      found = [...document.querySelectorAll(selector)];
    } catch {
      return null;
    }
    found = found.filter((n) => visibleRect(n) && styleOk(n));
    if (!found.length) return null;
    // Берём самый «глубокий» подходящий: кнопка, а не её контейнер.
    found.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    return found[0];
  }

  function findByText(needles) {
    for (const needle of needles || []) {
      const n = String(needle).toLowerCase().trim();
      if (n.length < 2) continue;
      let best = null;
      for (const item of state.catalog) {
        const hay = `${item.aria} ${item.text} ${item.title} ${item.id}`.toLowerCase();
        if (!hay.includes(n)) continue;
        const score = (item.aria ? 20 : 0) + (item.id ? 10 : 0) + 40 - Math.min((item.text || '').length, 60);
        if (!best || score > best.score) best = { score, node: nodeForRef(item.ref) };
      }
      if (best?.node) return best.node;
    }
    return null;
  }

  function resolveStep(step) {
    const target = step?.target || {};
    const nodes = [];
    const missing = [];
    for (const ref of target.refs || []) {
      const node = nodeForRef(ref);
      if (node) nodes.push(node);
      else missing.push(ref);
    }
    if (!nodes.length) {
      for (const sel of target.selectors || []) {
        const node = findBySelector(sel);
        if (node) {
          nodes.push(node);
          break;
        } else missing.push(sel);
      }
    }
    if (!nodes.length) {
      const node = findByText(target.findText);
      if (node) nodes.push(node);
      else if ((target.findText || []).length) missing.push(target.findText.join(' | '));
    }
    return { nodes, missing };
  }

  /* ------------------------------------------------------------- подсветка */

  function scrollTo(nodes) {
    const node = nodes[0];
    if (!node) return;
    const r = node.getBoundingClientRect();
    const fullyVisible = r.top >= 60 && r.bottom <= innerHeight - 60;
    if (fullyVisible) return;
    const delta = r.top - innerHeight / 2 + r.height / 2;
    scrollBy({ top: delta, behavior: 'smooth' });
  }

  function applyStep(step, opts = {}) {
    ensureRoot();
    const { nodes, missing } = resolveStep(step);
    if (!nodes.length) {
      clearOverlay();
      return { ok: false, resolved: [], missing, reason: 'Элемент не найден на странице' };
    }
    scrollTo(nodes);
    state.active = { step, opts, nodes };
    const animToken = `${step.index}|${step.pointer}|${nodes.length}`;
    let drawnToken = '';
    const draw = () => {
      const rects = state.active.nodes.map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) return;
      drawHighlights(rects, { label: opts.label, dim: opts.dim });
      const pRect = (() => {
        const t = state.active.step;
        if (!t.pointer) return rects[0];
        const pNode = nodeForRef(t.pointer) || state.active.nodes[0];
        const r = pNode.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 14), right: r.right, bottom: r.bottom };
      })();
      moveCursor(pRect, animToken !== drawnToken);
      if (state.plan) placeCard(rects[0]);
      drawnToken = animToken;
      state.raf = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(state.raf);
    draw();
    return {
      ok: true,
      resolved: nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), aria: n.getAttribute('aria-label') || '', text: shortText(n).slice(0, 60) };
      }),
      missing,
      rect: (() => {
        const r = nodes[0].getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })(),
    };
  }

  /* ------------------------------------- показ шага с карточкой на странице */

  /** Ставит карточку рядом с элементом: справа, если есть место, иначе снизу. */
  function placeCard(target) {
    const card = el('.uc-card');
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 14;
    let left;
    if (target.right + gap + cw < innerWidth - 8) left = target.right + gap;
    else if (target.left - gap - cw > 8) left = target.left - gap - cw;
    else left = Math.max(8, Math.min(innerWidth - cw - 8, target.left));
    let top = target.top + target.height / 2 - ch / 2;
    top = Math.max(8, Math.min(innerHeight - ch - 8, top));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.dataset.side = left > target.left ? 'right' : 'left';
  }

  /**
   * Основной вход: content script сам проходит по шагам.
   * Панель только присылает план и получает отчёт о прогрессе.
   */
  function showPlan(plan, options = {}, startIndex = 0) {
    if (!plan?.steps?.length) return { ok: false, reason: 'Пустой план' };
    state.plan = plan;
    state.options = options || {};
    clearOverlay();
    // Первый клик по элементу игнорируем: пользователь может просто ткнуть мимо.
    state.armedUntil = Date.now() + 1200;
    document.addEventListener('click', onPageClick, true);
    return show(Number(startIndex) || 0);
  }

  function show(i, opts = {}) {
    const plan = state.plan;
    if (!plan) return { ok: false, reason: 'Нет активного плана' };
    const total = plan.steps.length;
    state.index = Math.max(0, Math.min(i, total - 1));
    const step = plan.steps[state.index];

    renderCard(step, state.index, total, plan);

    // Жёлтая плашка не нужна: её роль теперь играет карточка на странице.
    const res = applyStep(step, { dim: state.options.dim, label: null });
    if (res.ok) {
      state.armedUntil = Date.now() + 900;
      if (!opts.silent) speak(step);
    }
    reportProgress(res);
    return { ...res, index: state.index, total };
  }

  function renderCard(step, i, total, plan) {
    const card = el('.uc-card');
    card.hidden = false;
    card.querySelector('.uc-card-step').textContent = `Шаг ${i + 1} из ${total}`;
    card.querySelector('.uc-card-tool').textContent = plan.toolName || '';
    card.querySelector('.uc-card-title').textContent = step.title || '';
    card.querySelector('.uc-card-text').textContent = step.instruction || '';

    const hint = card.querySelector('.uc-card-hint');
    hint.textContent = step.hint || '';
    hint.hidden = !step.hint;

    const check = card.querySelector('.uc-card-check');
    check.textContent = step.verify ? `Готово, когда: ${step.verify}` : '';
    check.hidden = !step.verify;

    const cta = card.querySelector('.uc-card-cta');
    const grounded = (step.target.refs || []).length > 0;
    cta.textContent = grounded
      ? 'Кликните по выделенному элементу — перейдём дальше'
      : 'Элемент не найден автоматически — нажмите «Далее» или укажите элемент в панели';
    cta.classList.toggle('uc-warn', !grounded);

    card.querySelector('.uc-b-prev').disabled = i === 0;
    card.querySelector('.uc-b-next').textContent = i === total - 1 ? 'Готово' : 'Далее';

    const dots = card.querySelector('.uc-dots');
    if (dots.childElementCount !== total) {
      dots.innerHTML = '';
      for (let k = 0; k < total; k++) dots.appendChild(document.createElement('i'));
    }
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
  }

  function reportProgress(res) {
    chrome.runtime
      .sendMessage({
        type: 'COACH_STEP',
        payload: { index: state.index, total: state.plan?.steps?.length || 0, ok: !!res?.ok, reason: res?.reason },
      })
      .catch(() => {});
  }

  /* ---------------------------------------------------------------- пикер */

  function enablePick() {
    ensureRoot();
    state.pick = true;
    const hover = el('.uc-hover');
    document.documentElement.style.cursor = 'crosshair';

    const onMove = (e) => {
      const node = e.composedPath?.()[0];
      if (!node || node.nodeType !== 1 || node.id === 'ui-coach-overlay') return;
      const r = node.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      state.hoverEl = node;
      place(hover, r, 2);
      hover.hidden = false;
      const tip = el('.uc-tip');
      tip.hidden = false;
      tip.textContent = `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''} — кликните, чтобы показать это ИИ`;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - 320, r.left))}px`;
      tip.style.top = `${r.bottom + 10}px`;
    };

    const onClick = (e) => {
      const node = state.hoverEl;
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      disablePick();
      chrome.runtime.sendMessage({ type: 'COACH_PICKED', payload: signatureOf(node) }).catch(() => {});
    };

    const onKey = (e) => {
      if (e.key === 'Escape') disablePick();
    };

    state.pickCleanup = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.cursor = '';
      hover.hidden = true;
      el('.uc-tip').hidden = true;
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return { ok: true, picking: true };
  }

  function disablePick() {
    state.pickCleanup?.();
    state.pickCleanup = null;
    state.pick = false;
    return { ok: true, picking: false };
  }

  /* ------------------------------------------------------------ сообщения */

  function pageSignals() {
    const meta = (name) => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
    const ids = [...document.querySelectorAll('[id]')].slice(0, 200).map((n) => n.id).join(' ');
    return {
      generator: meta('generator'),
      ogSite: meta('og:site_name'),
      app: meta('application-name'),
      ids: ids.slice(0, 1200),
    };
  }

  const handlers = {
    PING: () => ({ ok: true, url: location.href, title: document.title, ready: true }),

    CATALOG: ({ limit }) => {
      const { catalog, total } = buildCatalog(Math.max(60, Math.min(Number(limit) || 240, 800)));
      return { catalog, total, markers: pageSignals() };
    },

    SHOW_PLAN: ({ plan, options }) => showPlan(plan, options || {}),
    STEP: ({ index }) => show(index),
    STOP: () => {
      stopAll();
      disablePick();
      return { ok: true };
    },
    HIGHLIGHT: ({ step, options }) => applyStep(step, options || {}),
    CLEAR: () => {
      stopAll();
      disablePick();
      return { ok: true };
    },
    PICK: ({ on }) => (on ? enablePick() : disablePick()),
    SCROLL_TOP: () => {
      scrollTo({ top: 0, behavior: 'smooth' });
      return { ok: true };
    },
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const fn = handlers[msg?.type];
    if (!fn) return false;
    try {
      sendResponse(fn(msg.payload || {}));
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return false;
  });

  addEventListener('scroll', () => {}, { passive: true }); // кадры оверлея обновляются через rAF
})();
