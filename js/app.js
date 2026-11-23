// Entry point: picks the backend, wires the store to the screens.
import { STORAGE_PREFIX } from './config.js';
import { createStore } from './data/store.js';
import { h, haptic, reducedMotion } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { attachDayDrag } from './ui/drag.js';
import { openCreateSheet } from './ui/forms.js';
import { toast } from './ui/overlay.js';
import {
  applyTheme, dayView, loginView, monthView, planHeader, settingsView, tasksBody, tasksView, weekView,
} from './ui/views.js';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const useMock = isLocal && new URLSearchParams(location.search).has('mock');

applyTheme(localStorage.getItem(STORAGE_PREFIX + 'theme') || 'system');
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme(localStorage.getItem(STORAGE_PREFIX + 'theme') || 'system');
});

async function main() {
  const backend = useMock
    ? (await import('./data/backend-mock.js')).createMockBackend()
    : (await import('./data/backend-supabase.js')).createSupabaseBackend();
  const store = createStore(backend, { onError: (msg) => toast(msg, { tone: 'error' }) });
  /** @type {any} */ (window).__dayflow = store; // handy for debugging & tests

  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  let shell = null;
  let lastKey = '';
  let lastDate = store.state.date;
  let lastStatus = '';
  let scrolledToNow = false;

  function buildShell() {
    const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
    const tabs = [
      { id: 'plan', label: 'יומן', icon: 'calendar' },
      { id: 'tasks', label: 'משימות', icon: 'tasks' },
      { id: 'settings', label: 'הגדרות', icon: 'settings' },
    ];
    const tabButtons = tabs.map((t) => h('button', {
      type: 'button', class: 'tab', dataset: { tab: t.id },
      onClick: () => {
        haptic();
        if (store.state.tab === t.id && t.id === 'plan') store.goToday();
        store.setTab(/** @type {any} */ (t.id));
        window.scrollTo({ top: 0 });
      },
    }, icon(t.icon, 24), h('span', { class: 'tab-label' }, t.label)));
    const nav = h('nav', { class: 'tabbar', 'aria-label': 'ניווט ראשי' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/mark.svg', alt: '', width: 28, height: 28 }), h('span', null, 'Dayflow')),
      h('div', { class: 'tabs' }, tabButtons));
    const fab = h('button', {
      type: 'button', class: 'fab', 'aria-label': 'הוספה',
      onClick: () => {
        haptic();
        const s = store.state;
        openCreateSheet(store, { date: s.tab === 'plan' ? s.date : s.today, kind: s.tab === 'tasks' ? 'task' : 'activity' });
      },
    }, icon('plus', 26), h('span', { class: 'fab-label' }, 'הוספה'));
    const el = h('div', { class: 'shell' }, nav, main, fab);
    attachSwipe(main);
    attachDayDrag(main, store);
    return { el, main, tabButtons, fab };
  }

  /** Horizontal swipe changes day / week / month. In RTL, swiping right shows what comes next. */
  function attachSwipe(main) {
    let x0 = 0, y0 = 0, t0 = 0, active = false, decided = false, horizontal = false;
    main.addEventListener('touchstart', (e) => {
      if (store.state.tab !== 'plan' || e.touches.length !== 1) return;
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('.week-strip, .chips-scroll, input, textarea')) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
      active = true; decided = false; horizontal = false;
    }, { passive: true });
    const dragging = () => document.documentElement.classList.contains('is-dragging');
    main.addEventListener('touchmove', (e) => {
      if (!active) return;
      if (dragging()) { active = false; return; }
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (!decided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        decided = true;
        horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;
      }
      if (horizontal && !reducedMotion()) {
        const content = main.querySelector('.view-content');
        if (content) /** @type {HTMLElement} */ (content).style.transform = `translateX(${dx * 0.35}px)`;
      }
    }, { passive: true });
    const end = (e) => {
      if (!active) return;
      if (dragging()) { active = false; return; }
      active = false;
      const content = /** @type {HTMLElement|null} */ (main.querySelector('.view-content'));
      if (content) content.style.transform = '';
      if (!horizontal) return;
      const dx = (e.changedTouches[0] || { clientX: x0 }).clientX - x0;
      const fast = Date.now() - t0 < 250 && Math.abs(dx) > 30;
      if (Math.abs(dx) > 70 || fast) {
        haptic();
        store.step(dx > 0 ? 1 : -1);
      }
    };
    main.addEventListener('touchend', end);
    main.addEventListener('touchcancel', () => {
      active = false;
      const content = /** @type {HTMLElement|null} */ (main.querySelector('.view-content'));
      if (content) content.style.transform = '';
    });
  }

  function render() {
    const s = store.state;
    if (s.status !== lastStatus) {
      lastStatus = s.status;
      if (s.status === 'signed_out') {
        shell = null;
        app.replaceChildren(loginView(store));
        const u = app.querySelector('input');
        if (u) /** @type {HTMLInputElement} */ (u).focus();
        return;
      }
      if (s.status === 'loading') {
        shell = null;
        app.replaceChildren(h('div', { class: 'splash', role: 'status', 'aria-label': 'טוען' }, h('img', { src: 'icons/mark.svg', alt: '', width: 56, height: 56 })));
        return;
      }
    }
    if (s.status !== 'ready') return;
    if (s.profile && s.profile.theme) applyTheme(s.profile.theme);
    if (!shell) {
      shell = buildShell();
      app.replaceChildren(shell.el);
    }
    shell.tabButtons.forEach((b) => {
      const on = b.dataset.tab === s.tab;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    shell.fab.hidden = s.tab === 'settings';

    // Tasks screen: keep the quick-add field (and the keyboard) alive, re-render only the list.
    const chrome = /** @type {HTMLElement|null} */ (shell.main.querySelector('.tasks-chrome'));
    if (s.tab === 'tasks' && chrome && chrome.dataset.filter === s.taskFilter) {
      const body = /** @type {HTMLElement} */ (shell.main.querySelector('.tasks-body'));
      const next = tasksBody(store);
      body.replaceChildren(...(Array.isArray(next) ? next : [next]));
      lastKey = 'tasks|' + s.view;
      return;
    }

    let content;
    if (s.tab === 'plan') {
      const view = s.view === 'day' ? dayView(store) : s.view === 'week' ? weekView(store) : monthView(store);
      content = [planHeader(store), h('div', { class: 'view-content view-' + s.view }, view)];
    } else if (s.tab === 'tasks') {
      content = [h('div', { class: 'view-content' }, tasksView(store))];
    } else {
      content = [h('div', { class: 'view-content' }, settingsView(store))];
    }
    const key = s.tab + '|' + s.view;
    const dateMoved = s.date !== lastDate;
    const dir = s.date > lastDate ? 'next' : 'prev';
    shell.main.replaceChildren(...content);
    if (dateMoved && key === lastKey && !reducedMotion()) {
      const vc = shell.main.querySelector('.view-content');
      if (vc) vc.classList.add('enter-' + dir);
    }
    if (key !== lastKey || dateMoved) document.title = s.tab === 'plan' ? `Dayflow · ${/** @type {HTMLElement} */ (shell.main.querySelector('.title')).textContent}` : 'Dayflow';
    if (dateMoved) window.scrollTo({ top: 0 });
    lastKey = key;
    lastDate = s.date;

    // First open of today: bring the current part of the day into view.
    if (!scrolledToNow && s.tab === 'plan' && s.view === 'day' && s.date === s.today) {
      scrolledToNow = true;
      const now = /** @type {HTMLElement|null} */ (shell.main.querySelector('.period.is-now'));
      if (now && now.getBoundingClientRect().top > window.innerHeight * 0.6) {
        requestAnimationFrame(() => now.scrollIntoView({ block: 'center' }));
      }
    }
  }

  store.subscribe(render);
  render();

  // Keep data fresh and "today" correct when the app returns to the foreground.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) store.refresh();
  });
  window.addEventListener('online', () => store.refresh());

  // Keyboard shortcuts on desktop: ← / → move, T = today, N = new.
  document.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (store.state.status !== 'ready' || t.closest('input, textarea, [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (store.state.tab !== 'plan') return;
    if (e.key === 'ArrowLeft') store.step(1);
    else if (e.key === 'ArrowRight') store.step(-1);
    else if (e.key === 't' || e.key === 'ט') store.goToday();
    else if (e.key === 'n' || e.key === 'מ') { e.preventDefault(); openCreateSheet(store, { date: store.state.date }); }
  });

  await store.init();
}

main().catch((e) => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.replaceChildren(h('div', { class: 'fatal' }, h('p', null, 'לא הצלחנו לפתוח את Dayflow.'), h('p', { class: 'muted' }, 'בדקו את החיבור לאינטרנט ורעננו את הדף.'),
    h('button', { type: 'button', class: 'btn btn-primary', onClick: () => location.reload() }, 'רענון')));
});

if ('serviceWorker' in navigator && !isLocal) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
