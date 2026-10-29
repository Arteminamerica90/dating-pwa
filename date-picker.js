// iOS-подобный выбор даты рождения: нижний лист с тремя колёсами
// (день / месяц / год), как в настройках iPhone. Колёса — обычные
// scroll-контейнеры со scroll-snap: работают пальцем, мышью и клавиатурой,
// без сторонних библиотек и без нативных input[type=date] (их вид зависит
// от браузера и на iOS/Android выглядит по-разному).

const ITEM_H = 44;

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

let dialog = null;
let ctx = null;

export function formatRuDate(iso) {
  const parts = parseIso(iso);
  if (!parts) return '';
  return `${parts.day} ${MONTHS_GENITIVE[parts.month - 1]} ${parts.year}`;
}

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

// month: 1–12
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function pluralYears(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'лет';
  if (last > 1 && last < 5) return 'года';
  if (last === 1) return 'год';
  return 'лет';
}

function ageAt(year, month, day, today = new Date()) {
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
}

function tick() {
  try {
    navigator.vibrate?.(6);
  } catch {
    // вибрация — необязательный бонус
  }
}

function ensureDialog() {
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.className = 'dp-dialog';
  dialog.setAttribute('aria-labelledby', 'dpTitle');
  dialog.innerHTML = `
    <div class="dp-sheet">
      <div class="dp-head">
        <button type="button" class="dp-btn dp-cancel">Отмена</button>
        <div class="dp-title" id="dpTitle">Дата рождения</div>
        <button type="button" class="dp-btn dp-done">Готово</button>
      </div>
      <div class="dp-body">
        <div class="dp-wheels">
          <div class="dp-band" aria-hidden="true"></div>
          <div class="dp-wheel-wrap" data-wheel="day">
            <div class="dp-wheel" data-wheel="day" role="listbox" aria-label="День" tabindex="0"></div>
          </div>
          <div class="dp-wheel-wrap" data-wheel="month">
            <div class="dp-wheel" data-wheel="month" role="listbox" aria-label="Месяц" tabindex="0"></div>
          </div>
          <div class="dp-wheel-wrap" data-wheel="year">
            <div class="dp-wheel" data-wheel="year" role="listbox" aria-label="Год" tabindex="0"></div>
          </div>
        </div>
        <div class="dp-error" role="alert" hidden></div>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  dialog.querySelector('.dp-cancel').addEventListener('click', () => closePicker());
  dialog.querySelector('.dp-done').addEventListener('click', () => confirmPicker());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closePicker();
  });
  dialog.addEventListener('close', () => {
    // Если за время очереди событий пикер успели открыть заново, не затираем
    // свежий контекст и не снимаем блокировку прокрутки.
    if (dialog.open) return;
    ctx = null;
    document.body.classList.remove('dp-open');
  });

  // Тап по пункту — сразу ставим его по центру колеса.
  dialog.addEventListener('click', (e) => {
    const item = e.target.closest('.dp-item');
    if (!item || !ctx) return;
    const wheel = item.closest('.dp-wheel');
    const name = wheel?.dataset.wheel;
    if (!name) return;
    setIndex(name, Number(item.dataset.index), true);
  });

  ['day', 'month', 'year'].forEach((name) => {
    const wheel = dialog.querySelector(`.dp-wheel[data-wheel="${name}"]`);
    let settleTimer = 0;
    wheel.addEventListener(
      'scroll',
      () => {
        onScroll(name);
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => settle(name), 140);
      },
      { passive: true }
    );
    wheel.addEventListener('keydown', (e) => onKeydown(name, e));
  });

  return dialog;
}

function buildValues(parts, minYear, maxYear) {
  return {
    day: Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => String(i + 1)),
    month: MONTHS_GENITIVE.slice(),
    year: Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(minYear + i))
  };
}

function renderWheel(name, values) {
  const wheel = ctx.wheels[name].el;
  const frag = document.createDocumentFragment();
  values.forEach((label, i) => {
    const item = document.createElement('div');
    item.className = 'dp-item';
    item.dataset.index = String(i);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.textContent = label;
    frag.appendChild(item);
  });
  wheel.replaceChildren(frag);
  ctx.wheels[name].values = values;
}

// Перекрашиваем только две строки (бывшую и новую): колесо года содержит
// сотню пунктов, и полный обход на каждом кадре заметно тормозил бы скролл.
function paintWheel(name, prev = null) {
  const wheel = ctx.wheels[name].el;
  const idx = ctx.index[name];
  if (prev != null && prev !== idx) {
    const old = wheel.children[prev];
    if (old) {
      old.classList.remove('is-selected');
      old.setAttribute('aria-selected', 'false');
    }
  }
  const item = wheel.children[idx];
  if (item) {
    item.classList.add('is-selected');
    item.setAttribute('aria-selected', 'true');
  }
}

function scrollToIndex(name, idx, smooth) {
  const wheel = ctx.wheels[name].el;
  const top = idx * ITEM_H;
  if (Math.abs(wheel.scrollTop - top) < 1) return;
  wheel.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

function setIndex(name, idx, smooth) {
  if (!ctx) return;
  const max = ctx.wheels[name].values.length - 1;
  const next = clamp(Number(idx) || 0, 0, max);
  const prev = ctx.index[name];
  if (prev === next && Math.abs(ctx.wheels[name].el.scrollTop - next * ITEM_H) < 1) return;

  ctx.index[name] = next;
  ctx.value[name] = name === 'year' ? Number(ctx.wheels.year.values[next]) : next + 1;
  paintWheel(name, prev);
  scrollToIndex(name, next, smooth);
  if (name === 'month' || name === 'year') syncDayCount();
  clearError();
  if (prev !== next) tick();
}

function onScroll(name) {
  if (!ctx) return;
  const wheel = ctx.wheels[name].el;
  const max = ctx.wheels[name].values.length - 1;
  const idx = clamp(Math.round(wheel.scrollTop / ITEM_H), 0, max);
  if (idx === ctx.index[name]) return;

  const prev = ctx.index[name];
  ctx.index[name] = idx;
  ctx.value[name] = name === 'year' ? Number(ctx.wheels.year.values[idx]) : idx + 1;
  paintWheel(name, prev);
  clearError();
  if (name === 'month' || name === 'year') syncDayCount();
  tick();
}

// Дней в месяце меньше 31 — колесо дня пересобираем, выбранное число
// подрезаем (31 марта → 30 апреля), как это делает iPhone.
function syncDayCount() {
  const maxDay = daysInMonth(ctx.value.year, ctx.value.month);
  if (ctx.dayCount === maxDay) return;
  ctx.dayCount = maxDay;
  renderWheel('day', Array.from({ length: maxDay }, (_, i) => String(i + 1)));
  if (ctx.value.day > maxDay) {
    ctx.value.day = maxDay;
    ctx.index.day = maxDay - 1;
  }
  paintWheel('day');
  scrollToIndex('day', ctx.index.day, false);
}

// После остановки колеса доводим его ровно на центр пункта: scroll-snap
// в Safari иногда оставляет дробный scrollTop.
function settle(name) {
  if (!ctx) return;
  const wheel = ctx.wheels[name].el;
  const top = ctx.index[name] * ITEM_H;
  if (Math.abs(wheel.scrollTop - top) > 1) wheel.scrollTo({ top, behavior: 'smooth' });
}

function onKeydown(name, e) {
  if (!ctx) return;
  const max = ctx.wheels[name].values.length - 1;
  let next = null;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = ctx.index[name] + 1;
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = ctx.index[name] - 1;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = max;
  else if (e.key === 'PageDown') next = ctx.index[name] + 5;
  else if (e.key === 'PageUp') next = ctx.index[name] - 5;
  else if (e.key === 'Enter') {
    e.preventDefault();
    confirmPicker();
    return;
  }
  if (next == null) return;
  e.preventDefault();
  setIndex(name, next, true);
}

function showError(text) {
  const el = dialog?.querySelector('.dp-error');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  try {
    navigator.vibrate?.([18, 40, 18]);
  } catch {
    // ignore
  }
}

function clearError() {
  const el = dialog?.querySelector('.dp-error');
  if (el && !el.hidden) {
    el.hidden = true;
    el.textContent = '';
  }
}

function confirmPicker() {
  if (!ctx) return;
  const { year, month, day } = ctx.value;
  const age = ageAt(year, month, day);
  if (age < ctx.minAge) {
    showError(`Вам ${age} ${pluralYears(age)}. Сервис доступен только с ${ctx.minAge} лет.`);
    return;
  }
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  const onDone = ctx.onDone;
  closePicker();
  onDone?.(iso);
}

function closePicker() {
  if (!dialog?.open) return;
  dialog.close();
}

export function openDatePicker({ value = '', minAge = 18, title = 'Дата рождения', onDone } = {}) {
  if (dialog?.open) return;
  const dlg = ensureDialog();
  const today = new Date();
  const maxYear = today.getFullYear() - Math.max(0, Number(minAge) || 0);
  const minYear = today.getFullYear() - 100;

  let parts = parseIso(value);
  if (!parts) {
    const year = clamp(today.getFullYear() - 25, minYear, maxYear);
    const month = today.getMonth() + 1;
    parts = { year, month, day: Math.min(today.getDate(), daysInMonth(year, month)) };
  }
  parts = {
    year: clamp(parts.year, minYear, maxYear),
    month: clamp(parts.month, 1, 12),
    day: parts.day
  };
  parts.day = clamp(parts.day, 1, daysInMonth(parts.year, parts.month));

  const values = buildValues(parts, minYear, maxYear);
  ctx = {
    value: { ...parts },
    index: {
      day: parts.day - 1,
      month: parts.month - 1,
      year: values.year.indexOf(String(parts.year))
    },
    wheels: {
      day: { el: dlg.querySelector('.dp-wheel[data-wheel="day"]'), values: [] },
      month: { el: dlg.querySelector('.dp-wheel[data-wheel="month"]'), values: [] },
      year: { el: dlg.querySelector('.dp-wheel[data-wheel="year"]'), values: [] }
    },
    dayCount: daysInMonth(parts.year, parts.month),
    minAge: Number(minAge) || 0,
    onDone
  };

  dlg.querySelector('.dp-title').textContent = title;
  renderWheel('day', values.day);
  renderWheel('month', values.month);
  renderWheel('year', values.year);
  ['day', 'month', 'year'].forEach(paintWheel);
  clearError();

  document.body.classList.add('dp-open');
  dlg.showModal();

  // Раскладка появляется только после showModal — ставим колёса на место
  // следующим кадром, иначе scrollTop сбрасывается в 0.
  requestAnimationFrame(() => {
    if (!ctx) return;
    ['day', 'month', 'year'].forEach((name) => {
      const wheel = ctx.wheels[name].el;
      wheel.scrollTop = ctx.index[name] * ITEM_H;
      paintWheel(name);
    });
    ctx.wheels.day.el.focus({ preventScroll: true });
  });
}
