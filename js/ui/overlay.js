// Bottom sheets, choice sheets and toasts.
import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';

let openCount = 0;
const root = () => /** @type {HTMLElement} */ (document.getElementById('overlays'));

/** Keeps the focused input visible above the iOS keyboard. */
function trackKeyboard(panel) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}

/**
 * Opens a bottom sheet (centered dialog on wide screens).
 * @param {{ title?: string, body: HTMLElement, footer?: HTMLElement|null, headerActions?: HTMLElement|null,
 *           onClose?: () => void, label?: string, size?: 'auto'|'tall' }} opts
 */
export function openSheet(opts) {
  const previouslyFocused = /** @type {HTMLElement|null} */ (document.activeElement);
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const closeBtn = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'סגירה' }, icon('x', 20));
  const header = h('div', { class: 'sheet-header' },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-titlebar' },
      opts.title ? h('h2', { class: 'sheet-title', id: 'sheet-title-' + openCount }, opts.title) : h('span'),
      h('div', { class: 'sheet-header-actions' }, opts.headerActions || null, closeBtn)));
  const panel = h('div', {
    class: 'sheet' + (opts.size === 'tall' ? ' sheet-tall' : ''),
    role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': opts.title ? 'sheet-title-' + openCount : null,
    'aria-label': opts.title ? null : opts.label || null,
  }, header, h('div', { class: 'sheet-body' }, opts.body), opts.footer ? h('div', { class: 'sheet-footer' }, opts.footer) : null);
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, panel);
  root().appendChild(wrap);
  openCount++;
  document.documentElement.classList.add('sheet-open');
  const untrack = trackKeyboard(panel);
  requestAnimationFrame(() => wrap.classList.add('is-open'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    untrack();
    wrap.classList.remove('is-open');
    wrap.classList.add('is-closing');
    document.removeEventListener('keydown', onKey);
    const done = () => {
      wrap.remove();
      openCount--;
      if (openCount === 0) document.documentElement.classList.remove('sheet-open');
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
    if (reducedMotion()) done();
    else setTimeout(done, 240);
    opts.onClose && opts.onClose();
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === 'Escape' && wrap === root().lastElementChild) close();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  // Drag the header down to dismiss.
  let startY = 0, dy = 0, dragging = false;
  header.addEventListener('pointerdown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
    dragging = true; startY = e.clientY; dy = 0;
    panel.style.transition = 'none';
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) close();
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  return { close, panel };
}

/**
 * Asks the user to pick one option. Resolves to the option value, or null if dismissed.
 * @param {{ title: string, message?: string, options: {label: string, value: string, tone?: 'danger'|'primary'}[] }} opts
 * @returns {Promise<string|null>}
 */
export function choose(opts) {
  return new Promise((resolve) => {
    let result = null;
    const body = h('div', { class: 'choice' },
      opts.message ? h('p', { class: 'choice-message' }, opts.message) : null,
      ...opts.options.map((o) => h('button', {
        type: 'button',
        class: 'choice-btn' + (o.tone ? ' is-' + o.tone : ''),
        onClick: () => { result = o.value; sheet.close(); },
      }, o.label)));
    const sheet = openSheet({ title: opts.title, body, onClose: () => resolve(result) });
  });
}

// ---------- toasts ----------
let toastTimer = 0;
/**
 * @param {string} text
 * @param {{ action?: string, onAction?: () => void, tone?: 'error'|'info', duration?: number }} [opts]
 */
export function toast(text, opts = {}) {
  const host = /** @type {HTMLElement} */ (document.getElementById('toasts'));
  host.replaceChildren();
  const el = h('div', { class: 'toast' + (opts.tone === 'error' ? ' is-error' : ''), role: 'status' },
    opts.tone === 'error' ? icon('wifiOff', 18) : null,
    h('span', { class: 'toast-text' }, text),
    opts.action ? h('button', {
      type: 'button', class: 'toast-action',
      onClick: () => { opts.onAction && opts.onAction(); el.remove(); },
    }, opts.action) : null);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 250);
  }, opts.duration || (opts.action ? 5000 : 3200));
}
