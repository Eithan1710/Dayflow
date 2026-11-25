// Screens. Each returns a fresh DOM tree built from the store state.
import {
  DAY_LETTERS, DAY_NAMES, addDays, dayDiff, formatDayMonth, formatMonthYear, formatTime, formatWeekRange,
  formatWeekday, monthGrid, monthKey, relativeLabel, shortDateLabel, startOfWeek, weekKeys, weekday,
} from '../lib/dates.js';
import { PERIODS, currentPeriod, periodById } from '../lib/periods.js';
import { describeRepeat } from '../lib/recurrence.js';
import { h, haptic, ltr } from './dom.js';
import { icon } from './icons.js';
import { openActivitySheet, openCategorySheet, openCreateSheet, openPasswordSheet, openTaskSheet, segmented } from './forms.js';
import { toast } from './overlay.js';
import { DRAG_HINT_KEY } from './drag.js';

/** @typedef {ReturnType<typeof import('../data/store.js').createStore>} Store */
/** @typedef {import('../data/store.js').Instance} Instance */

// =====================================================================
// Plan header (shared by day / week / month)
// =====================================================================
/** @param {Store} store */
export function planHeader(store) {
  const s = store.state;
  const seg = segmented([
    { value: 'day', label: 'יום' },
    { value: 'week', label: 'שבוע' },
    { value: 'month', label: 'חודש' },
  ], s.view, (v) => store.setView(v), 'תצוגה');
  seg.el.classList.add('view-switch');

  let sub = null, title = '', isCurrent = false;
  if (s.view === 'day') {
    const rel = relativeLabel(s.date, s.today);
    sub = h('span', { class: 'title-sub' }, formatWeekday(s.date), rel ? h('span', { class: 'badge' + (rel === 'היום' ? ' is-today' : '') }, rel) : null);
    title = formatDayMonth(s.date) + (s.date.slice(0, 4) !== s.today.slice(0, 4) ? ' ' + s.date.slice(0, 4) : '');
    isCurrent = s.date === s.today;
  } else if (s.view === 'week') {
    const start = startOfWeek(s.date);
    const diff = dayDiff(startOfWeek(s.today), start) / 7;
    const rel = diff === 0 ? 'השבוע' : diff === 1 ? 'שבוע הבא' : diff === -1 ? 'שבוע שעבר' : null;
    sub = h('span', { class: 'title-sub' }, rel || ' ');
    title = formatWeekRange(start);
    isCurrent = diff === 0;
  } else {
    title = formatMonthYear(s.date);
    isCurrent = monthKey(s.date) === monthKey(s.today);
    sub = h('span', { class: 'title-sub' }, isCurrent ? 'החודש' : ' ');
  }
  const unit = { day: 'יום', week: 'שבוע', month: 'חודש' }[s.view];
  const prevLabel = { day: 'היום הקודם', week: 'השבוע הקודם', month: 'החודש הקודם' }[s.view];
  const nextLabel = { day: 'היום הבא', week: 'השבוע הבא', month: 'החודש הבא' }[s.view];

  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' }, seg.el),
    h('div', { class: 'titlebar' },
      h('div', { class: 'title-block' }, sub, h('h1', { class: 'title', 'aria-live': 'polite' }, title)),
      h('div', { class: 'nav-btns' },
        !isCurrent ? h('button', { type: 'button', class: 'pill-btn', onClick: () => { haptic(); store.goToday(); } }, 'היום') : null,
        h('button', { type: 'button', class: 'icon-btn round', 'aria-label': prevLabel, title: `${unit} קודם`, onClick: () => store.step(-1) }, icon('chevronRight', 20)),
        h('button', { type: 'button', class: 'icon-btn round', 'aria-label': nextLabel, title: `${unit} הבא`, onClick: () => store.step(1) }, icon('chevronLeft', 20)),
      )));
}

// =====================================================================
// Shared item renderers
// =====================================================================
/** @param {Store} store @param {Instance} inst @param {{compactDate?: boolean}} [opt] */
function activityCard(store, inst, opt = {}) {
  const a = inst.a;
  const cat = store.category(a.category_id);
  const color = store.colorOf(a);
  const meta = [];
  if (a.start_time) meta.push(h('span', { class: 'meta' }, icon('clock', 15), ltr(a.end_time ? `${formatTime(a.start_time)}–${formatTime(a.end_time)}` : formatTime(a.start_time))));
  if (inst.spanCount > 1) meta.push(h('span', { class: 'meta' }, `יום ${inst.spanIndex} מתוך ${inst.spanCount}`));
  if (a.location) meta.push(h('span', { class: 'meta' }, icon('pin', 15), h('span', { class: 'meta-text' }, a.location)));
  if (inst.recurring) meta.push(h('span', { class: 'meta', title: describeRepeat(a) }, icon('repeat', 15), describeRepeat(a)));
  if (cat) meta.push(h('span', { class: 'meta meta-cat' }, h('span', { class: 'dot', dataset: { color: cat.color } }), cat.name));

  // Single-day items can be dragged to another part of the day (see ui/drag.js).
  const dataset = inst.spanCount > 1 ? { color } : { color, drag: 'activity', key: inst.key };
  // Activities are for arranging the day, not for ticking off: no completion control here
  // (checkboxes belong to tasks).
  return h('article', { class: 'card' + (a.priority === 3 ? ' is-important' : ''), dataset },
    h('button', { type: 'button', class: 'card-main', onClick: () => openActivitySheet(store, inst) },
      h('span', { class: 'card-title' }, a.priority === 3 ? icon('flag', 15) : null, a.title),
      meta.length ? h('span', { class: 'card-meta' }, meta) : null));
}

/** @param {Store} store */
function taskRow(store, t, opt = {}) {
  const today = store.state.today;
  const cat = store.category(t.category_id);
  const meta = [];
  if (opt.showDates !== false) {
    if (t.scheduled_date) meta.push(h('span', { class: 'meta' }, icon('calendar', 14), shortDateLabel(t.scheduled_date, today), t.period ? ', ' + /** @type {any} */ (periodById(t.period)).label : ''));
    if (t.due_date) meta.push(h('span', { class: 'meta' + (!t.completed && t.due_date < today ? ' is-late' : '') }, icon('flag', 14), 'עד ' + shortDateLabel(t.due_date, today)));
  } else if (t.due_date && !t.completed && t.due_date < today) {
    meta.push(h('span', { class: 'meta is-late' }, icon('flag', 14), 'באיחור'));
  }
  if (cat) meta.push(h('span', { class: 'meta meta-cat' }, h('span', { class: 'dot', dataset: { color: cat.color } }), cat.name));
  if (t.priority === 3) meta.push(h('span', { class: 'meta is-high' }, 'עדיפות גבוהה'));

  return h('div', { class: 'task' + (t.completed ? ' is-done' : ''), dataset: { drag: 'task', id: t.id } },
    h('button', {
      type: 'button', class: 'box', role: 'checkbox', 'aria-checked': String(!!t.completed),
      'aria-label': `${t.title}: ${t.completed ? 'בוצעה' : 'לא בוצעה'}`,
      onClick: (e) => {
        haptic();
        /** @type {HTMLElement} */ (e.currentTarget).classList.add('pop');
        store.toggleTask(t);
        if (!t.completed && store.state.tab === 'tasks' && store.state.taskFilter === 'open') {
          toast('המשימה בוצעה', { action: 'ביטול', onAction: () => store.toggleTask({ ...t, completed: true }) });
        }
      },
    }, icon('check', 14)),
    h('button', { type: 'button', class: 'task-main', onClick: () => openTaskSheet(store, t) },
      h('span', { class: 'task-title' }, t.title),
      meta.length ? h('span', { class: 'card-meta' }, meta) : null));
}

// =====================================================================
// Day view
// =====================================================================
/** @param {Store} store */
export function dayView(store) {
  const s = store.state;
  const k = s.date;
  const data = store.dayData(k);
  const nowPeriod = k === s.today ? currentPeriod() : null;
  const pastIdx = k < s.today ? 99 : k === s.today ? PERIODS.findIndex((p) => p.id === nowPeriod) : -1;
  const total = data.spanning.length + data.looseTasks.length +
    PERIODS.reduce((n, p) => n + data.byPeriod[p.id].length + data.tasksByPeriod[p.id].length, 0);

  const top = [];
  if (data.spanning.length) {
    top.push(h('section', { class: 'group', 'aria-label': 'לאורך היום' },
      h('h2', { class: 'group-title' }, icon('allDay', 17), 'לאורך היום'),
      h('div', { class: 'stack' }, data.spanning.map((i) => activityCard(store, i)))));
  }
  if (data.looseTasks.length) {
    top.push(h('section', { class: 'group', 'aria-label': 'משימות להיום' },
      h('h2', { class: 'group-title' }, icon('tasks', 17), k === s.today ? 'משימות להיום' : 'משימות ליום הזה'),
      h('div', { class: 'task-list' }, data.looseTasks.map((t) => taskRow(store, t, { showDates: false })))));
  }

  const periods = PERIODS.map((p, idx) => {
    const entries = data.itemsByPeriod[p.id];
    const empty = !entries.length;
    const add = () => { haptic(); openCreateSheet(store, { date: k, period: p.id }); };
    const state = p.id === nowPeriod ? ' is-now' : idx < pastIdx ? ' is-past' : '';
    const head = empty
      ? h('button', { type: 'button', class: 'period-head is-action', onClick: add, 'aria-label': `הוספה ל${p.label}` },
        h('span', { class: 'node' }, icon(p.icon, 18)),
        h('span', { class: 'period-name' }, p.label),
        h('span', { class: 'period-hint' }, ltr(p.hint)),
        p.id === nowPeriod ? h('span', { class: 'now-tag' }, 'עכשיו') : null,
        h('span', { class: 'period-add' }, icon('plus', 18)))
      : h('div', { class: 'period-head' },
        h('span', { class: 'node' }, icon(p.icon, 18)),
        h('h2', { class: 'period-name' }, p.label),
        h('span', { class: 'period-hint' }, ltr(p.hint)),
        p.id === nowPeriod ? h('span', { class: 'now-tag' }, 'עכשיו') : null,
        h('button', { type: 'button', class: 'period-add', onClick: add, 'aria-label': `הוספה ל${p.label}` }, icon('plus', 18)));
    return h('li', { class: 'period' + (empty ? ' is-empty' : '') + state, dataset: { period: p.id } },
      head,
      empty ? null : h('div', { class: 'stack' },
        // Activities and tasks share one order (drag to rearrange, see ui/drag.js).
        entries.map((e) => (e.kind === 'activity'
          ? activityCard(store, /** @type {any} */ (e.inst))
          : h('div', { class: 'task-list is-solo' }, taskRow(store, e.t, { showDates: false }))))));
  });

  const draggable = PERIODS.some((p) => data.byPeriod[p.id].length || data.tasksByPeriod[p.id].length) || data.looseTasks.length;
  return h('div', { class: 'day' },
    s.loadError ? errorBanner(store) : null,
    draggable ? dragHint() : null,
    top,
    total === 0 ? h('p', { class: 'empty-hint' }, k < s.today ? 'לא היה כלום מתוכנן ביום הזה.' : 'היום פנוי. הקישו על חלק ביום כדי להוסיף משהו.') : null,
    h('ol', { class: 'timeline' }, periods));
}

/** One-time tip that items can be dragged between parts of the day. */
function dragHint() {
  let seen = '1';
  try { seen = localStorage.getItem(DRAG_HINT_KEY) || ''; } catch { /* ignore */ }
  if (seen) return null;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const tip = h('div', { class: 'tip', role: 'note' },
    icon('sparkle', 17),
    h('span', null, touch ? 'לחיצה ארוכה על פעילות וגרירה מעבירה אותה לחלק אחר של היום.' : 'אפשר לגרור פעילות לחלק אחר של היום.'),
    h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'הבנתי',
      onClick: () => { try { localStorage.setItem(DRAG_HINT_KEY, '1'); } catch { /* ignore */ } tip.remove(); },
    }, icon('x', 16)));
  return tip;
}

function errorBanner(store) {
  return h('div', { class: 'banner', role: 'alert' }, icon('wifiOff', 18),
    h('span', null, 'לא הצלחנו לטעון את הנתונים.'),
    h('button', { type: 'button', class: 'pill-btn', onClick: () => store.loadAll() }, 'נסו שוב'));
}

// =====================================================================
// Week view
// =====================================================================
/** @param {Store} store */
export function weekView(store) {
  const s = store.state;
  const days = weekKeys(s.date);
  const perDay = days.map((k) => ({ k, insts: store.instancesOn(k), tasks: [...s.tasks.values()].filter((t) => t.scheduled_date === k) }));

  const strip = h('div', { class: 'week-strip', role: 'list' }, perDay.map(({ k, insts, tasks }) => {
    const n = insts.length + tasks.length;
    return h('button', {
      type: 'button', role: 'listitem',
      class: 'strip-day' + (k === s.today ? ' is-today' : '') + (k === s.date ? ' is-selected' : ''),
      'aria-label': `${formatWeekday(k)} ${formatDayMonth(k)}, ${n ? n + ' פריטים' : 'פנוי'}`,
      onClick: () => store.openDay(k),
    },
    h('span', { class: 'strip-letter' }, DAY_LETTERS[weekday(k)]),
    h('span', { class: 'strip-num' }, String(Number(k.slice(8)))),
    h('span', { class: 'dots' }, insts.slice(0, 3).map((i) => h('span', { class: 'dot', dataset: { color: store.colorOf(i.a) } })),
      !insts.length && tasks.length ? h('span', { class: 'dot is-task' }) : null));
  }));

  const list = h('div', { class: 'week-days' }, perDay.map(({ k, insts, tasks }) => {
    const rel = relativeLabel(k, s.today);
    const rows = [
      ...insts.map((i) => {
        const p = i.a.all_day || i.spanCount > 1 ? null : periodById(i.a.period || '');
        const when = i.a.start_time ? ltr(formatTime(i.a.start_time)) : p ? p.label : i.spanCount > 1 ? `${i.spanIndex}/${i.spanCount}` : 'כל היום';
        return h('button', {
          type: 'button', class: 'agenda-row', dataset: { color: store.colorOf(i.a) },
          onClick: () => openActivitySheet(store, i),
        },
        h('span', { class: 'dot' }),
        h('span', { class: 'agenda-when' }, when),
        h('span', { class: 'agenda-title' }, i.a.priority === 3 ? icon('flag', 14) : null, i.a.title));
      }),
      ...tasks.map((t) => h('button', { type: 'button', class: 'agenda-row is-task' + (t.completed ? ' is-done' : ''), onClick: () => openTaskSheet(store, t) },
        h('span', { class: 'mini-box' }),
        h('span', { class: 'agenda-when' }, t.period ? /** @type {any} */ (periodById(t.period)).label : 'משימה'),
        h('span', { class: 'agenda-title' }, t.title))),
    ];
    return h('section', { class: 'week-day' + (k === s.today ? ' is-today' : '') + (k < s.today ? ' is-past' : '') },
      h('button', { type: 'button', class: 'week-day-head', onClick: () => store.openDay(k), 'aria-label': `פתיחת ${formatWeekday(k)} ${formatDayMonth(k)}` },
        h('span', { class: 'wd-num' }, String(Number(k.slice(8)))),
        h('span', { class: 'wd-name' }, `יום ${DAY_NAMES[weekday(k)]}`),
        rel ? h('span', { class: 'badge' + (rel === 'היום' ? ' is-today' : '') }, rel) : null,
        h('span', { class: 'wd-go' }, icon('chevronLeft', 18))),
      rows.length ? h('div', { class: 'agenda' }, rows)
        : h('button', { type: 'button', class: 'agenda-empty', onClick: () => openCreateSheet(store, { date: k }) }, icon('plus', 16), 'יום פנוי'));
  }));

  return h('div', { class: 'week' }, s.loadError ? errorBanner(store) : null, strip, list);
}

// =====================================================================
// Month view
// =====================================================================
/** @param {Store} store */
export function monthView(store) {
  const s = store.state;
  const grid = monthGrid(s.date);
  const m = monthKey(s.date);
  const head = h('div', { class: 'month-head', 'aria-hidden': 'true' }, DAY_LETTERS.map((l) => h('span', null, l)));
  const cells = grid.map((k) => {
    const insts = store.instancesOn(k);
    const tasks = [...s.tasks.values()].filter((t) => t.scheduled_date === k && !t.completed);
    const important = insts.some((i) => i.a.priority === 3);
    const n = insts.length + tasks.length;
    return h('button', {
      type: 'button',
      class: 'mcell' + (monthKey(k) !== m ? ' is-out' : '') + (k === s.today ? ' is-today' : '') + (important ? ' is-important' : '') + (k < s.today ? ' is-past' : ''),
      'aria-label': `${formatWeekday(k)} ${formatDayMonth(k)}${n ? `, ${n} פריטים` : ''}${important ? ', חשוב' : ''}`,
      onClick: () => store.openDay(k),
    },
    h('span', { class: 'mnum' }, String(Number(k.slice(8)))),
    h('span', { class: 'mitems' }, insts.slice(0, 3).map((i) => h('span', { class: 'mitem', dataset: { color: store.colorOf(i.a) } }, h('span', { class: 'mitem-text' }, i.a.title)))),
    n > 3 ? h('span', { class: 'mmore' }, ltr(`+${n - 3}`)) : null,
    !insts.length && tasks.length ? h('span', { class: 'mitems' }, h('span', { class: 'mitem is-task' }, h('span', { class: 'mitem-text' }, tasks[0].title))) : null);
  });
  return h('div', { class: 'month' }, s.loadError ? errorBanner(store) : null,
    h('div', { class: 'month-grid-wrap' }, head, h('div', { class: 'month-grid' }, cells)),
    upcoming(store));
}

/** Short list under the month grid: the next important items. */
function upcoming(store) {
  const s = store.state;
  const from = s.date.slice(0, 7) === s.today.slice(0, 7) ? s.today : s.date.slice(0, 8) + '01';
  const rows = [];
  for (let k = from; rows.length < 4 && dayDiff(from, k) < 31; k = addDays(k, 1)) {
    for (const i of store.instancesOn(k)) {
      if (i.a.priority === 3 || i.a.all_day || i.spanCount > 1) {
        if (i.spanCount > 1 && i.spanIndex > 1 && k !== from) continue;
        rows.push(i);
        if (rows.length >= 4) break;
      }
    }
  }
  if (!rows.length) return null;
  return h('section', { class: 'group upcoming' },
    h('h2', { class: 'group-title' }, icon('flag', 16), 'חשוב בקרוב'),
    h('div', { class: 'agenda' }, rows.map((i) => h('button', {
      type: 'button', class: 'agenda-row', dataset: { color: store.colorOf(i.a) }, onClick: () => store.openDay(i.date),
    }, h('span', { class: 'dot' }), h('span', { class: 'agenda-when' }, shortDateLabel(i.date, s.today)), h('span', { class: 'agenda-title' }, i.a.title)))));
}

// =====================================================================
// Tasks view
// =====================================================================
/** @param {Store} store */
export function tasksView(store) {
  const s = store.state;
  const filter = segmented([
    { value: 'open', label: 'לביצוע' },
    { value: 'done', label: 'הושלמו' },
  ], s.taskFilter, (v) => { s.taskFilter = v; store.emit(); }, 'סינון');

  let draft = '';
  const input = /** @type {HTMLInputElement} */ (h('input', {
    class: 'input quick-add-input', type: 'text', placeholder: 'משימה חדשה…', 'aria-label': 'משימה חדשה', maxlength: 200,
    enterkeyhint: 'done', autocomplete: 'off',
    onInput: () => { draft = input.value; addBtn.disabled = !draft.trim(); },
  }));
  const addBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'icon-btn round is-accent', 'aria-label': 'הוספת משימה', disabled: true }, icon('plus', 20)));
  const quickAdd = h('form', {
    class: 'quick-add',
    onSubmit: (e) => {
      e.preventDefault();
      if (!draft.trim()) return;
      store.createTask({ title: draft.trim() });
      draft = '';
      input.value = '';
      addBtn.disabled = true;
      haptic();
      input.focus();
    },
  }, input, addBtn);

  return h('div', { class: 'tasks' },
    h('div', { class: 'tasks-chrome', dataset: { filter: s.taskFilter } },
      h('header', { class: 'topbar' },
        h('div', { class: 'titlebar' }, h('div', { class: 'title-block' }, h('h1', { class: 'title' }, 'משימות'))),
        h('div', { class: 'topbar-row' }, filter.el)),
      s.taskFilter === 'open' ? quickAdd : null),
    h('div', { class: 'tasks-body' }, tasksBody(store)));
}

/** The list part of the tasks screen (re-rendered without touching the quick-add field). @param {Store} store */
export function tasksBody(store) {
  const s = store.state;
  const all = [...s.tasks.values()];
  const today = s.today;
  /** @type {[string, any[]][]} */
  let groups;
  if (s.taskFilter === 'open') {
    const open = all.filter((t) => !t.completed);
    const when = (t) => [t.scheduled_date, t.due_date].filter(Boolean).sort()[0] || '';
    const byDate = (a, b) => when(a).localeCompare(when(b)) || String(a.created_at).localeCompare(String(b.created_at));
    groups = [['באיחור', []], ['היום', []], ['בהמשך', []], ['בלי תאריך', []]];
    for (const t of open.sort(byDate)) groups[taskBucket(t, today)][1].push(t);
  } else {
    groups = [['', all.filter((t) => t.completed).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))]];
  }
  const nonEmpty = groups.filter(([, list]) => list.length);
  if (!nonEmpty.length) {
    return h('div', { class: 'empty-state' },
      h('span', { class: 'empty-icon' }, icon(s.taskFilter === 'open' ? 'sparkle' : 'tasks', 28)),
      h('p', null, s.taskFilter === 'open' ? 'אין משימות פתוחות. כתבו משימה בשורה למעלה כדי להוסיף.' : 'משימות שתסמנו כבוצעו יופיעו כאן.'));
  }
  return nonEmpty.map(([label, list]) => h('section', { class: 'group' },
    label ? h('h2', { class: 'group-title' + (label === 'באיחור' ? ' is-late' : '') }, label, h('span', { class: 'count' }, String(list.length))) : null,
    h('div', { class: 'task-list' }, list.map((t) => taskRow(store, t)))));
}

/** 0 = late, 1 = today, 2 = later, 3 = no date */
export function taskBucket(t, today) {
  const s = t.scheduled_date, d = t.due_date;
  if (s ? s < today : d && d < today) return 0;
  if (s === today || d === today) return 1;
  if (s || d) return 2;
  return 3;
}

// =====================================================================
// Settings view
// =====================================================================
/** @param {Store} store */
export function settingsView(store) {
  const s = store.state;
  const theme = (s.profile && s.profile.theme) || 'system';
  const themeSeg = segmented([
    { value: 'system', label: 'אוטומטי' },
    { value: 'light', label: 'בהיר' },
    { value: 'dark', label: 'כהה' },
  ], theme, (v) => { store.setTheme(v); applyTheme(v); }, 'מראה');

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone;
  const row = (iconName, label, onClick, extra = null, tone = '') => h('button', { type: 'button', class: 'list-row' + tone, onClick },
    icon(iconName, 20), h('span', { class: 'list-label' }, label), extra, icon('chevronLeft', 18));

  return h('div', { class: 'settings' },
    h('header', { class: 'topbar' }, h('div', { class: 'titlebar' }, h('div', { class: 'title-block' }, h('h1', { class: 'title' }, 'הגדרות')))),
    h('section', { class: 'group' },
      h('h2', { class: 'group-title' }, 'חשבון'),
      h('div', { class: 'list' },
        h('div', { class: 'list-row is-static' }, h('span', { class: 'avatar' }, (s.session && s.session.username || '?').slice(0, 1)),
          h('span', { class: 'list-label' }, 'מחובר בתור ', h('strong', null, s.session && s.session.username))),
        row('key', 'החלפת סיסמה', () => openPasswordSheet(store)),
        h('button', { type: 'button', class: 'list-row is-danger', onClick: () => store.signOut() }, icon('logout', 20), h('span', { class: 'list-label' }, 'התנתקות')))),
    h('section', { class: 'group' },
      h('h2', { class: 'group-title' }, 'מראה'),
      themeSeg.el),
    h('section', { class: 'group' },
      h('h2', { class: 'group-title' }, 'קטגוריות'),
      h('div', { class: 'list' },
        s.categories.map((c) => h('button', { type: 'button', class: 'list-row', onClick: () => openCategorySheet(store, c) },
          h('span', { class: 'dot dot-lg', dataset: { color: c.color } }), h('span', { class: 'list-label' }, c.name), icon('chevronLeft', 18))),
        h('button', { type: 'button', class: 'list-row is-accent', onClick: () => openCategorySheet(store) }, icon('plus', 20), h('span', { class: 'list-label' }, 'קטגוריה חדשה')))),
    !isStandalone ? h('section', { class: 'group' },
      h('h2', { class: 'group-title' }, 'התקנה במסך הבית'),
      h('div', { class: 'note-card' },
        h('p', null, 'באייפון: פתחו את האתר ב-Safari, הקישו על ', h('span', { class: 'inline-icon' }, icon('share', 16)), ' שיתוף, ואז על "הוספה למסך הבית".'),
        h('p', { class: 'muted' }, 'Dayflow ייפתח כמו אפליקציה, במסך מלא.'))) : null,
    h('p', { class: 'footnote' }, 'Dayflow'));
}

/** Applies the theme to <html>. @param {string} theme */
export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'system';
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1217' : '#f4f5f7');
}

// =====================================================================
// Login
// =====================================================================
/** @param {Store} store */
export function loginView(store) {
  const err = h('p', { class: 'field-error', role: 'alert' });
  err.hidden = true;
  const user = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'שם משתמש', 'aria-label': 'שם משתמש', required: true }));
  const pass = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'סיסמה', 'aria-label': 'סיסמה', required: true }));
  const btn = /** @type {HTMLButtonElement} */ (h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'כניסה'));
  const form = h('form', {
    class: 'login-form', novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!user.value.trim() || !pass.value) {
        err.textContent = 'נא למלא שם משתמש וסיסמה.';
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'נכנסים…';
      try {
        await store.signIn(user.value, pass.value);
      } catch (ex) {
        const code = ex && ex.code;
        err.textContent = code === 'bad_credentials' ? 'שם המשתמש או הסיסמה שגויים.'
          : code === 'not_member' ? 'לחשבון הזה אין גישה ל-Dayflow.'
            : code === 'offline' ? 'אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.'
              : 'הכניסה נכשלה. נסו שוב בעוד רגע.';
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = 'כניסה';
        pass.select();
      }
    },
  }, user, pass, err, btn);

  return h('main', { class: 'login' },
    h('div', { class: 'login-sky', 'aria-hidden': 'true' }),
    h('div', { class: 'login-card' },
      h('img', { class: 'login-mark', src: 'icons/mark.svg', alt: '', width: 64, height: 64 }),
      h('h1', { class: 'login-title' }, 'Dayflow'),
      h('p', { class: 'login-sub' }, 'התכנון היומי שלך, לפי חלקי היום'),
      form));
}
