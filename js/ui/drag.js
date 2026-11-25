// Drag & drop of activities and tasks in the day view: into another part of the day,
// or to a new position inside the same part (manual order).
// Touch: long-press, then drag (a plain swipe still scrolls / changes day).
// Mouse: press and move.
import { STORAGE_PREFIX } from '../config.js';
import { haptic } from './dom.js';
import { choose, toast } from './overlay.js';

const LONG_PRESS_MS = 320;
const TOUCH_SLOP = 8;   // finger may wobble this much during the long-press
const MOUSE_SLOP = 5;
export const DRAG_HINT_KEY = STORAGE_PREFIX + 'drag-hint-seen';

/** "הועבר ללילה" etc. */
const TO_PERIOD = {
  morning: 'לבוקר',
  late_morning: 'לשעות לפני הצהריים',
  noon: 'לצהריים',
  afternoon: 'לאחר הצהריים',
  evening: 'לערב',
  night: 'ללילה',
};

/** @param {HTMLElement} main @param {ReturnType<typeof import('../data/store.js').createStore>} store */
export function attachDayDrag(main, store) {
  const root = document.documentElement;
  /** @type {{ el: HTMLElement, x0: number, y0: number, x: number, y: number, timer: number, mouse: boolean } | null} */
  let pending = null;
  /** @type {{ ghost: HTMLElement, source: HTMLElement, kind: string, id: string, offX: number, offY: number,
   *           x: number, y: number, target: string|null, index: number, line: HTMLElement, raf: number } | null} */
  let drag = null;
  let suppressClick = false;

  const enabled = () => store.state.tab === 'plan' && store.state.view === 'day' && !document.querySelector('.sheet-wrap');

  /** @param {EventTarget|null} target */
  function draggableFrom(target) {
    const t = /** @type {HTMLElement} */ (target);
    if (!t || !t.closest || t.closest('.check, .box')) return null; // checkboxes stay checkboxes
    const el = /** @type {HTMLElement|null} */ (t.closest('[data-drag]'));
    return el && main.contains(el) && el.closest('.day') ? el : null;
  }

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  // ---------- start ----------
  function begin() {
    if (!pending || !enabled()) return cancelPending();
    const el = pending.el;
    if (!el.isConnected) return cancelPending();
    const rect = el.getBoundingClientRect();
    const ghost = /** @type {HTMLElement} */ (el.cloneNode(true));
    ghost.classList.add('drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    el.classList.add('is-drag-source');
    root.classList.add('is-dragging');
    const line = document.createElement('div');
    line.className = 'drop-line';
    line.hidden = true;
    document.body.appendChild(line);
    drag = {
      ghost, source: el,
      kind: /** @type {string} */ (el.dataset.drag),
      id: /** @type {string} */ (el.dataset.drag === 'activity' ? el.dataset.key : el.dataset.id),
      offX: pending.x - rect.left, offY: pending.y - rect.top,
      x: pending.x, y: pending.y, target: null, index: 0, line, raf: 0,
    };
    pending = null;
    suppressClick = true;
    try { localStorage.setItem(DRAG_HINT_KEY, '1'); } catch { /* ignore */ }
    haptic();
    move(drag.x, drag.y);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  // ---------- move ----------
  function move(x, y) {
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    drag.ghost.style.transform = `translate3d(${x - drag.offX}px, ${y - drag.offY}px, 0) rotate(-1deg) scale(1.03)`;
    const under = document.elementFromPoint(x, y);
    const period = /** @type {HTMLElement|null} */ (under && under.closest ? under.closest('.timeline .period') : null);
    const id = period ? /** @type {string} */ (period.dataset.period) : null;
    if (id !== drag.target) {
      drag.target = id;
      if (id) haptic();
    }
    main.querySelectorAll('.period.is-drop-target').forEach((p) => {
      if (/** @type {HTMLElement} */ (p).dataset.period !== id) p.classList.remove('is-drop-target');
    });
    if (period) period.classList.add('is-drop-target');
    placeLine(period, y);
  }

  /** @param {HTMLElement} el */
  function isSource(el) {
    if (!drag || el.dataset.drag !== drag.kind) return false;
    return drag.kind === 'activity' ? el.dataset.key === drag.id : el.dataset.id === drag.id;
  }

  /** Works out where in the period the item would land and draws the guide line there. */
  function placeLine(period, y) {
    if (!drag) return;
    const line = drag.line;
    if (!period) { line.hidden = true; return; }
    const items = /** @type {HTMLElement[]} */ ([...period.querySelectorAll('.stack [data-drag]')]).filter((el) => !isSource(el));
    let index = 0;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) index++;
    }
    drag.index = index;
    const stack = /** @type {HTMLElement|null} */ (period.querySelector('.stack'));
    const box = (stack || period).getBoundingClientRect();
    const width = box.width - 52; // leave the timeline column free
    let lineY;
    if (!items.length) lineY = /** @type {HTMLElement} */ (period.querySelector('.period-head')).getBoundingClientRect().bottom + 2;
    else if (index === 0) lineY = items[0].getBoundingClientRect().top - 5;
    else lineY = items[index - 1].getBoundingClientRect().bottom + 4;
    line.style.width = width + 'px';
    line.style.transform = `translate3d(${box.left}px, ${lineY - 1.5}px, 0)`;
    line.hidden = false;
  }

  /** Scrolls the page while the finger is near the top/bottom edge. */
  function autoScroll() {
    if (!drag) return;
    const top = 170, bottom = window.innerHeight - 150;
    let v = 0;
    if (drag.y < top) v = -Math.min(18, (top - drag.y) / 6);
    else if (drag.y > bottom) v = Math.min(18, (drag.y - bottom) / 6);
    if (v) {
      window.scrollBy(0, v);
      move(drag.x, drag.y);
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  // ---------- end ----------
  function cleanup() {
    if (!drag) return null;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    d.ghost.remove();
    d.line.remove();
    d.source.classList.remove('is-drag-source');
    main.querySelectorAll('.is-drag-source').forEach((e) => e.classList.remove('is-drag-source'));
    main.querySelectorAll('.period.is-drop-target').forEach((p) => p.classList.remove('is-drop-target'));
    root.classList.remove('is-dragging');
    setTimeout(() => { suppressClick = false; }, 50);
    return d;
  }

  async function drop() {
    const d = cleanup();
    if (!d || !d.target) return;
    const period = d.target;
    const date = store.state.date;

    if (d.kind === 'task') {
      const t = store.state.tasks.get(d.id);
      if (!t) return;
      const r = store.arrangePeriod(date, period, { kind: 'task', id: t.id }, d.index);
      if (r.periodChanged && r.undo) toast(`המשימה הועברה ${TO_PERIOD[period]}`, { action: 'ביטול', onAction: r.undo });
      return;
    }

    const inst = store.instancesOn(date).find((i) => i.key === d.id);
    if (!inst) return;
    const periodChanges = inst.a.all_day || inst.a.period !== period;
    let scope = 'all';
    if (inst.recurring && periodChanges) {
      const r = await choose({
        title: 'פעילות חוזרת',
        message: 'להעביר רק את המופע של היום או את כל הסדרה?',
        options: [
          { label: 'רק את המופע הזה', value: 'this', tone: 'primary' },
          { label: 'את כל הסדרה', value: 'all' },
        ],
      });
      if (!r) return;
      scope = r;
    }
    const res = store.arrangePeriod(date, period, { kind: 'activity', id: inst.a.id, inst }, d.index, /** @type {any} */ (scope));
    if (!res.changed || !res.periodChanged) return; // a reorder speaks for itself
    const text = `${inst.a.title} הועבר ${TO_PERIOD[period]}` + (res.timeCleared ? '. השעה המדויקת הוסרה' : '');
    toast(text, res.undo ? { action: 'ביטול', onAction: res.undo } : {});
  }

  // ---------- touch ----------
  main.addEventListener('touchstart', (e) => {
    if (!enabled() || e.touches.length !== 1) return;
    const el = draggableFrom(e.target);
    if (!el) return;
    const t = e.touches[0];
    cancelPending();
    pending = { el, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, mouse: false, timer: window.setTimeout(begin, LONG_PRESS_MS) };
  }, { passive: true });

  // Non-passive so the page doesn't scroll while an item is being dragged.
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (drag) {
      e.preventDefault();
      move(t.clientX, t.clientY);
    } else if (pending && !pending.mouse) {
      pending.x = t.clientX;
      pending.y = t.clientY;
      if (Math.hypot(t.clientX - pending.x0, t.clientY - pending.y0) > TOUCH_SLOP) cancelPending(); // it's a scroll
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (drag) {
      e.preventDefault(); // no click on the card after a drag
      void drop();
    } else cancelPending();
  });
  document.addEventListener('touchcancel', () => { cleanup(); cancelPending(); });
  main.addEventListener('contextmenu', (e) => { if (pending || drag) e.preventDefault(); });

  // ---------- mouse ----------
  main.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !enabled()) return;
    const el = draggableFrom(e.target);
    if (!el) return;
    cancelPending();
    pending = { el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, mouse: true, timer: 0 };
  });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (drag) move(e.clientX, e.clientY);
    else if (pending && pending.mouse) {
      pending.x = e.clientX;
      pending.y = e.clientY;
      if (Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) > MOUSE_SLOP) begin();
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (drag) void drop();
    else cancelPending();
  });
  window.addEventListener('blur', () => { cleanup(); cancelPending(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) cleanup(); });

  // Swallow the click that follows a drag (it would open the edit sheet).
  document.addEventListener('click', (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  }, true);

  return { isDragging: () => !!drag };
}
