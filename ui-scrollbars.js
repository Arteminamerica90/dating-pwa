// iOS-подобная полоса прокрутки: тонкая, поверх контента, появляется только
// во время прокрутки и плавно исчезает. Нативные полосы скрыты в styles.css.
// Работает для любой прокручиваемой области (чат, диалоги, лента, страница).
export function installIosScrollbars() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('iosScrollThumb')) return;

  const thumb = document.createElement('div');
  thumb.id = 'iosScrollThumb';
  thumb.className = 'ios-scrollbar';
  document.body.appendChild(thumb);

  let target = null;
  let hideTimer = 0;

  const pageScroller = () => document.scrollingElement || document.documentElement;

  const scrollableFor = (node) => {
    if (!node) return null;
    if (node === document || node === document.documentElement || node === document.body) {
      const el = pageScroller();
      return el && el.scrollHeight - el.clientHeight > 4 ? el : null;
    }
    if (!(node instanceof Element)) return null;
    const cs = getComputedStyle(node);
    if (!/(auto|scroll|overlay)/.test(cs.overflowY)) return null;
    if (node.scrollHeight - node.clientHeight < 4) return null;
    return node;
  };

  const paint = () => {
    if (!target || !target.isConnected) {
      thumb.classList.remove('show');
      return;
    }
    const isPage = target === pageScroller();
    const rect = isPage
      ? { top: 0, bottom: window.innerHeight, right: window.innerWidth }
      : target.getBoundingClientRect();
    const max = target.scrollHeight - target.clientHeight;
    if (max < 4 || rect.bottom - rect.top < 40) {
      thumb.classList.remove('show');
      return;
    }
    const pad = 4;
    const track = Math.max(0, rect.bottom - rect.top - pad * 2);
    const size = Math.max(26, Math.round(track * (target.clientHeight / target.scrollHeight)));
    const progress = Math.min(1, Math.max(0, target.scrollTop / max));
    // Внутри модалки ползунок должен жить в её top-layer, иначе он окажется
    // под ней (top layer рисуется выше любого z-index).
    const host = target.closest?.('dialog[open]') || document.body;
    if (thumb.parentElement !== host) host.appendChild(thumb);
    thumb.style.height = `${size}px`;
    thumb.style.top = `${Math.round(rect.top + pad + progress * (track - size))}px`;
    thumb.style.left = `${Math.round((isPage ? window.innerWidth : rect.right) - 9)}px`;
    thumb.classList.add('show');
  };

  let lastPaint = 0;

  // Красим прямо в обработчике: scroll и так приходит не чаще кадра, а
  // requestAnimationFrame в фоновой/скрытой вкладке не вызывается вовсе.
  const schedule = () => {
    const now = performance.now();
    if (now - lastPaint < 16) return;
    lastPaint = now;
    paint();
  };

  document.addEventListener(
    'scroll',
    (e) => {
      const found = scrollableFor(e.target);
      if (!found) return;
      target = found;
      schedule();
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => thumb.classList.remove('show'), 850);
    },
    { capture: true, passive: true }
  );

  window.addEventListener('resize', () => {
    if (!target) return;
    schedule();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => thumb.classList.remove('show'), 500);
  });

  // Переключение экрана/вкладки: ползунок не должен висеть над новым контентом.
  document.addEventListener(
    'click',
    () => {
      if (!thumb.classList.contains('show')) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => thumb.classList.remove('show'), 260);
    },
    true
  );
}
