// Create / edit sheets for activities, tasks, categories and the password.
import {
  DAY_LETTERS, addDays, formatDayMonth, relativeLabel, shortDateLabel, todayKey, weekday,
} from '../lib/dates.js';
import { PERIODS, defaultPeriodFor, periodById, periodForTime } from '../lib/periods.js';
import { REPEAT_OPTIONS } from '../lib/recurrence.js';
import { errorText } from '../data/store.js';
import { h, haptic } from './dom.js';
import {
  PRIORITY_OPTIONS, categoryChips, chips, colorSwatches, dateField, disclosure, field, timeInput,
} from './fields.js';
import { icon } from './icons.js';
import { choose, openSheet, toast } from './overlay.js';

/** @typedef {ReturnType<typeof import('../data/store.js').createStore>} Store */

const PERIOD_CHOICES = [
  ...PERIODS.map((p) => ({ value: p.id, label: p.label, icon: p.icon })),
  { value: 'all_day', label: 'כל היום', icon: 'allDay' },
];

function titleInput(value, placeholder, onInput, onEnter) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    class: 'input input-title', type: 'text', value, placeholder, maxlength: 200,
    'aria-label': 'כותרת', enterkeyhint: 'done', autocomplete: 'off',
    onInput: () => onInput(input.value),
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } },
  }));
  return input;
}

function textArea(value, placeholder, onInput) {
  const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', {
    class: 'input input-area', rows: 3, placeholder, maxlength: 4000, 'aria-label': placeholder,
    onInput: () => onInput(ta.value),
  }));
  ta.value = value || '';
  return ta;
}

function textLine(value, placeholder, onInput, label) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    class: 'input', type: 'text', value: value || '', placeholder, maxlength: 200, 'aria-label': label,
    onInput: () => onInput(input.value),
  }));
  return input;
}

const nullIfBlank = (s) => (s && s.trim() ? s.trim() : null);

/** Where an item landed, in words: "מחר בערב", "יום ה׳ 27.11, בוקר". */
function placeLabel(date, period) {
  const p = period ? periodById(period) : null;
  const day = relativeLabel(date) || shortDateLabel(date);
  return p ? `${day}, ${p.label}` : day;
}

// =====================================================================
// Create sheet (activity or task)
// =====================================================================
/**
 * @param {Store} store
 * @param {{ date?: string, period?: string|null, kind?: 'activity'|'task', allDay?: boolean }} ctx
 */
export function openCreateSheet(store, ctx = {}) {
  let kind = ctx.kind || 'activity';
  let title = '';
  const container = h('div');
  /** @type {{ el: HTMLElement, save: () => void, valid: () => boolean, focus: () => void } | null} */
  let form = null;
  const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => form && form.save() }, 'הוספה'));
  const refresh = () => { saveBtn.disabled = !(form && form.valid()); };

  const kindSwitch = segmented([
    { value: 'activity', label: 'פעילות', icon: 'calendar' },
    { value: 'task', label: 'משימה', icon: 'tasks' },
  ], kind, (v) => { kind = v; mount(); form && form.focus(); }, 'סוג');

  function mount() {
    const common = {
      title, onTitle: (t) => { title = t; refresh(); },
      onDone: () => sheet.close(), refresh,
    };
    form = kind === 'activity'
      ? activityForm(store, { ...common, ctx })
      : taskForm(store, { ...common, ctx: { scheduled: store.state.tab === 'plan' ? ctx.date || store.state.date : null, period: ctx.period || null } });
    container.replaceChildren(form.el);
    refresh();
  }

  const body = h('div', { class: 'form' }, kindSwitch.el, container);
  const sheet = openSheet({ title: 'הוספה', body, footer: saveBtn });
  mount();
  form && form.focus();
}

/** Two-or-more option segmented control. */
export function segmented(options, value, onChange, label) {
  const c = chips({ label, value, options, onChange: (v) => v != null && onChange(v) });
  c.el.classList.add('segmented');
  return c;
}

// =====================================================================
// Activity form
// =====================================================================
/**
 * @param {Store} store
 * @param {{ title: string, onTitle: (t: string) => void, onDone: () => void, refresh: () => void,
 *           ctx?: { date?: string, period?: string|null, allDay?: boolean }, inst?: import('../data/store.js').Instance }} o
 */
function activityForm(store, o) {
  const today = store.state.today;
  const inst = o.inst;
  const src = inst ? inst.a : null;
  const date0 = inst ? (inst.recurring ? inst.date : src.start_date) : (o.ctx && o.ctx.date) || store.state.date;
  const d = {
    title: o.title,
    start_date: date0,
    end_date: src && !inst.recurring ? src.end_date || null : null,
    period: src ? src.period : (o.ctx && o.ctx.period) || defaultPeriodFor(date0, today),
    all_day: src ? !!src.all_day : !!(o.ctx && o.ctx.allDay),
    start_time: src ? src.start_time : null,
    end_time: src ? src.end_time : null,
    category_id: src ? src.category_id : null,
    color: src ? src.color : null,
    location: src ? src.location : null,
    priority: src ? src.priority : null,
    description: src ? src.description : null,
    repeat_freq: src ? src.repeat_freq || '' : '',
    repeat_interval: src ? src.repeat_interval || 1 : 1,
    repeat_weekdays: src && src.repeat_weekdays ? [...src.repeat_weekdays] : null,
    repeat_until: src ? src.repeat_until : null,
  };
  let periodTouched = !!src || !!(o.ctx && o.ctx.period);
  let repeatTouched = false;

  const titleEl = titleInput(d.title, 'מה מתוכנן?', (t) => { d.title = t; o.onTitle(t); }, () => save());

  const periodChips = chips({
    label: 'חלק ביום', value: d.all_day ? 'all_day' : d.period, options: PERIOD_CHOICES, compact: true,
    onChange: (v) => {
      periodTouched = true;
      if (v === 'all_day') { d.all_day = true; } else { d.all_day = false; d.period = v; }
      timeRow.hidden = d.all_day;
    },
  });

  const dateChips = dateField({
    label: 'תאריך', value: d.start_date,
    onChange: (v) => {
      d.start_date = /** @type {string} */ (v);
      if (d.end_date && d.end_date <= d.start_date) { d.end_date = null; endDate.set(null); }
      if (!periodTouched && !d.start_time) { d.period = defaultPeriodFor(d.start_date, today); periodChips.set(d.period); }
      weekdayChips.syncDefault();
    },
  });

  const cats = categoryChips(store.state.categories, d.category_id, (v) => { d.category_id = v; });

  // --- advanced ---
  const startT = timeInput({
    label: 'שעת התחלה', value: d.start_time,
    onChange: (v) => {
      d.start_time = v;
      endT.disabled = !v;
      if (!v) { d.end_time = null; endT.value = ''; }
      if (v && !periodTouched) { d.period = periodForTime(v); periodChips.set(d.period); }
      timeError.hidden = true;
    },
  });
  const endT = timeInput({ label: 'שעת סיום', value: d.end_time, onChange: (v) => { d.end_time = v; timeError.hidden = true; } });
  endT.disabled = !d.start_time;
  const timeError = h('p', { class: 'field-error', role: 'alert' }, 'שעת הסיום צריכה להיות אחרי שעת ההתחלה');
  timeError.hidden = true;
  const timeRow = field('שעה מדויקת (לא חובה)', h('div', null,
    h('div', { class: 'time-pair' }, startT, h('span', { class: 'time-sep', 'aria-hidden': 'true' }, 'עד'), endT), timeError), { icon: 'clock' });
  timeRow.hidden = d.all_day;

  const endDate = dateField({
    label: 'תאריך סיום', value: d.end_date, allowNone: true, noneLabel: 'יום אחד', min: addDays(d.start_date, 1),
    onChange: (v) => {
      if (v && v <= d.start_date) { toast('תאריך הסיום צריך להיות אחרי תאריך ההתחלה'); endDate.set(d.end_date); return; }
      d.end_date = v;
    },
  });
  const endDateRow = field('נמשך כמה ימים? עד:', endDate.el, { icon: 'calendar' });
  endDateRow.hidden = !!d.repeat_freq;

  const weekdayChips = weekdayPicker(d, () => { repeatTouched = true; });
  const untilField = dateField({
    label: 'חוזר עד', value: d.repeat_until, allowNone: true, noneLabel: 'ללא סוף',
    onChange: (v) => { d.repeat_until = v; repeatTouched = true; },
  });
  const weekdaysRow = h('div', { class: 'field-sub' }, h('span', { class: 'field-sublabel' }, 'באילו ימים?'), weekdayChips.el);
  const repeatExtra = h('div', { class: 'repeat-extra' },
    weekdaysRow,
    h('div', { class: 'field-sub' }, h('span', { class: 'field-sublabel' }, 'עד מתי?'), untilField.el));
  const repeatChips = chips({
    label: 'חוזר?', value: d.repeat_freq, options: REPEAT_OPTIONS.map((r) => ({ value: r.id, label: r.formLabel || r.label })), scroll: true,
    onChange: (v) => {
      repeatTouched = true;
      d.repeat_freq = v || '';
      if (!v) repeatChips.set('');
      paintRepeat();
    },
  });
  function paintRepeat() {
    repeatExtra.hidden = !d.repeat_freq;
    weekdaysRow.hidden = d.repeat_freq !== 'weekly';
    endDateRow.hidden = !!d.repeat_freq;
    weekdayChips.syncDefault();
  }
  paintRepeat();

  const prio = chips({ label: 'עדיפות', value: d.priority, options: PRIORITY_OPTIONS, allowNone: true, onChange: (v) => { d.priority = v; } });
  const colors = colorSwatches({ value: d.color, allowNone: true, onChange: (v) => { d.color = v; } });
  const loc = textLine(d.location, 'איפה?', (v) => { d.location = v; }, 'מיקום');
  const notes = textArea(d.description, 'הערות', (v) => { d.description = v; });

  const hasAdvanced = !!(d.start_time || d.end_date || d.location || d.priority || d.color || d.description);
  const more = disclosure('פרטים נוספים', h('div', { class: 'form-stack' },
    timeRow,
    endDateRow,
    field('מיקום', loc, { icon: 'pin' }),
    field('עדיפות', prio.el, { icon: 'flag' }),
    field('צבע משלו', colors.el, { icon: 'palette' }),
    field('הערות', notes, { icon: 'note' }),
  ), hasAdvanced);

  const el = h('div', { class: 'form-stack' },
    titleEl,
    field('מתי ביום', periodChips.el),
    field('יום', dateChips.el),
    field('חוזר?', h('div', null, repeatChips.el, repeatExtra), { icon: 'repeat' }),
    store.state.categories.length ? field('קטגוריה', cats.el) : null,
    more,
  );

  function build() {
    const a = {
      title: d.title.trim(),
      description: nullIfBlank(d.description),
      location: nullIfBlank(d.location),
      start_date: d.start_date,
      end_date: d.repeat_freq ? null : d.end_date && d.end_date > d.start_date ? d.end_date : null,
      all_day: d.all_day,
      period: d.all_day ? null : d.period,
      start_time: d.all_day ? null : d.start_time || null,
      end_time: d.all_day || !d.start_time ? null : d.end_time || null,
      category_id: d.category_id || null,
      color: d.color || null,
      priority: d.priority || null,
      repeat_freq: d.repeat_freq || null,
      repeat_interval: 1,
      repeat_weekdays: d.repeat_freq === 'weekly' ? (d.repeat_weekdays && d.repeat_weekdays.length ? [...d.repeat_weekdays].sort() : [weekday(d.start_date)]) : null,
      repeat_until: d.repeat_freq && d.repeat_until && d.repeat_until >= d.start_date ? d.repeat_until : null,
    };
    if (!a.all_day && !a.period) a.period = a.start_time ? periodForTime(a.start_time) : 'morning';
    return a;
  }

  async function save() {
    if (!valid()) return;
    const a = build();
    if (a.start_time && a.end_time && a.end_time <= a.start_time) {
      timeError.hidden = false;
      return;
    }
    if (!inst) {
      store.createActivity(a);
      o.onDone();
      announce(store, a.start_date, a.all_day ? null : a.period, 'הפעילות נוספה');
      return;
    }
    // Editing
    if (inst.recurring && !repeatTouched) {
      const scope = await choose({
        title: 'פעילות חוזרת',
        message: 'לשמור את השינוי רק למופע הזה או לכל הסדרה?',
        options: [
          { label: 'רק למופע הזה', value: 'this', tone: 'primary' },
          { label: 'לכל הסדרה', value: 'all' },
        ],
      });
      if (!scope) return;
      if (scope === 'this') {
        const { repeat_freq, repeat_interval, repeat_weekdays, repeat_until, ...single } = a;
        store.detachOccurrence(inst, single);
      } else {
        // Keep the series' original start date unless the user moved it explicitly.
        store.updateActivity(src.id, { ...a, start_date: a.start_date === inst.date ? src.start_date : a.start_date });
      }
    } else {
      store.updateActivity(src.id, a);
    }
    o.onDone();
  }
  const valid = () => !!d.title.trim();

  return { el, save, valid, focus: () => { if (!inst) titleEl.focus(); } };
}

/** Weekday toggles for weekly repeats. */
function weekdayPicker(d, onChange = () => {}) {
  const buttons = DAY_LETTERS.map((label, i) => {
    const b = h('button', {
      type: 'button', class: 'day-toggle', 'aria-pressed': 'false', 'aria-label': `יום ${label}`,
      onClick: () => {
        const set = new Set(d.repeat_weekdays || [weekday(d.start_date)]);
        if (set.has(i)) { if (set.size > 1) set.delete(i); } else set.add(i);
        d.repeat_weekdays = [...set].sort();
        paint();
        onChange();
        haptic();
      },
    }, label);
    return b;
  });
  const el = h('div', { class: 'day-toggles', role: 'group', 'aria-label': 'ימים בשבוע' }, buttons);
  function paint() {
    const set = new Set(d.repeat_weekdays || [weekday(d.start_date)]);
    buttons.forEach((b, i) => {
      b.classList.toggle('is-on', set.has(i));
      b.setAttribute('aria-pressed', String(set.has(i)));
    });
  }
  paint();
  return { el, syncDefault: paint };
}

/** After creating something off-screen, tell the user where it went. */
function announce(store, date, period, text) {
  const s = store.state;
  const visible = s.tab === 'plan' && (s.view === 'day' ? s.date === date : true);
  if (visible) return;
  toast(`${text}: ${placeLabel(date, period)}`, { action: 'הצגה', onAction: () => store.openDay(date) });
}

// =====================================================================
// Edit activity sheet
// =====================================================================
/** @param {Store} store @param {import('../data/store.js').Instance} inst */
export function openActivitySheet(store, inst) {
  let title = inst.a.title;
  const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => form.save() }, 'שמירה'));
  const form = activityForm(store, {
    title, inst,
    onTitle: (t) => { title = t; saveBtn.disabled = !t.trim(); },
    onDone: () => sheet.close(),
    refresh: () => {},
  });

  const tomorrow = addDays(inst.date, 1);
  const quick = h('div', { class: 'quick-actions' },
    quickBtn('למחר', 'arrowLeft', () => {
      store.moveInstance(inst, tomorrow);
      sheet.close();
      toast(`הועבר ל${relativeLabel(tomorrow) === 'מחר' ? 'מחר' : formatDayMonth(tomorrow)}`, { action: 'הצגה', onAction: () => store.openDay(tomorrow) });
    }, 'העברה ליום הבא'),
    quickBtn('שכפול', 'copy', () => {
      store.duplicateActivity(inst);
      sheet.close();
      toast('הפעילות שוכפלה');
    }, 'שכפול הפעילות'),
  );

  const del = h('button', {
    type: 'button', class: 'icon-btn is-danger', 'aria-label': 'מחיקה',
    onClick: async () => {
      let scope = 'all';
      if (inst.recurring) {
        const r = await choose({
          title: 'מחיקת פעילות חוזרת',
          options: [
            { label: 'רק המופע הזה', value: 'this', tone: 'danger' },
            { label: 'כל הסדרה', value: 'all', tone: 'danger' },
          ],
        });
        if (!r) return;
        scope = r;
      }
      const undo = store.deleteActivity(inst, scope);
      sheet.close();
      toast('הפעילות נמחקה', { action: 'ביטול', onAction: undo });
    },
  }, icon('trash', 20));

  const body = h('div', { class: 'form' }, quick, form.el);
  const sheet = openSheet({ title: 'עריכת פעילות', body, footer: saveBtn, headerActions: del });
}

function quickBtn(label, iconName, onClick, aria) {
  return h('button', { type: 'button', class: 'quick-btn', onClick, 'aria-label': aria },
    icon(iconName, 20), h('span', { class: 'quick-label' }, label));
}

// =====================================================================
// Task form
// =====================================================================
/**
 * @param {Store} store
 * @param {{ title: string, onTitle: (t: string) => void, onDone: () => void, refresh: () => void,
 *           ctx?: { scheduled?: string|null, period?: string|null }, task?: any }} o
 */
function taskForm(store, o) {
  const t = o.task;
  const d = {
    title: o.title,
    scheduled_date: t ? t.scheduled_date : (o.ctx && o.ctx.scheduled) || null,
    period: t ? t.period : (o.ctx && o.ctx.period) || null,
    due_date: t ? t.due_date : null,
    category_id: t ? t.category_id : null,
    priority: t ? t.priority : null,
    description: t ? t.description : null,
  };
  const titleEl = titleInput(d.title, 'מה צריך לעשות?', (v) => { d.title = v; o.onTitle(v); }, () => save());

  const periodChips = chips({
    label: 'חלק ביום', value: d.period, allowNone: true, compact: true,
    options: PERIODS.map((p) => ({ value: p.id, label: p.label, icon: p.icon })),
    onChange: (v) => { d.period = v; },
  });
  const periodRow = h('div', { class: 'field-sub' }, h('span', { class: 'field-sublabel' }, 'באיזה חלק של היום? (לא חובה)'), periodChips.el);
  periodRow.hidden = !d.scheduled_date;
  const sched = dateField({
    label: 'מתי לעשות', value: d.scheduled_date, allowNone: true, noneLabel: 'לא ביומן',
    onChange: (v) => { d.scheduled_date = v; if (!v) { d.period = null; periodChips.set(null); } periodRow.hidden = !v; },
  });
  const due = dateField({ label: 'תאריך יעד', value: d.due_date, allowNone: true, noneLabel: 'ללא', onChange: (v) => { d.due_date = v; } });
  const cats = categoryChips(store.state.categories, d.category_id, (v) => { d.category_id = v; });
  const prio = chips({ label: 'עדיפות', value: d.priority, options: PRIORITY_OPTIONS, allowNone: true, onChange: (v) => { d.priority = v; } });
  const notes = textArea(d.description, 'הערות', (v) => { d.description = v; });

  const hasAdvanced = !!(d.due_date || d.priority || d.description || d.category_id);
  const el = h('div', { class: 'form-stack' },
    titleEl,
    field('שיבוץ ביומן', h('div', null, sched.el, periodRow), { icon: 'calendar' }),
    disclosure('פרטים נוספים', h('div', { class: 'form-stack' },
      field('תאריך יעד', due.el, { icon: 'flag' }),
      store.state.categories.length ? field('קטגוריה', cats.el, { icon: 'tag' }) : null,
      field('עדיפות', prio.el),
      field('הערות', notes, { icon: 'note' }),
    ), hasAdvanced),
  );

  const valid = () => !!d.title.trim();
  function save() {
    if (!valid()) return;
    const data = {
      title: d.title.trim(),
      description: nullIfBlank(d.description),
      scheduled_date: d.scheduled_date,
      period: d.scheduled_date ? d.period : null,
      due_date: d.due_date,
      category_id: d.category_id || null,
      priority: d.priority || null,
    };
    if (t) store.updateTask(t.id, data);
    else {
      store.createTask(data);
      if (data.scheduled_date) announce(store, data.scheduled_date, data.period, 'המשימה נוספה');
      else if (store.state.tab !== 'tasks') toast('המשימה נוספה לרשימת המשימות', { action: 'הצגה', onAction: () => store.setTab('tasks') });
    }
    o.onDone();
  }
  return { el, save, valid, focus: () => { if (!t) titleEl.focus(); } };
}

/** @param {Store} store */
export function openTaskSheet(store, task) {
  const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => form.save() }, 'שמירה'));
  const form = taskForm(store, {
    title: task.title, task,
    onTitle: (t) => { saveBtn.disabled = !t.trim(); },
    onDone: () => sheet.close(),
    refresh: () => {},
  });
  const quick = h('div', { class: 'quick-actions' },
    quickBtn(task.completed ? 'לא בוצע' : 'בוצע', task.completed ? 'x' : 'check', () => { store.toggleTask(task); sheet.close(); },
      task.completed ? 'סימון כלא בוצע' : 'סימון כבוצע'),
    quickBtn('להיום', 'calendar', () => {
      store.updateTask(task.id, { scheduled_date: todayKey() });
      sheet.close();
      toast('המשימה שובצה להיום', { action: 'הצגה', onAction: () => store.openDay(todayKey()) });
    }, 'שיבוץ להיום'),
  );
  const del = h('button', {
    type: 'button', class: 'icon-btn is-danger', 'aria-label': 'מחיקה',
    onClick: () => {
      const undo = store.deleteTask(task);
      sheet.close();
      toast('המשימה נמחקה', { action: 'ביטול', onAction: undo });
    },
  }, icon('trash', 20));
  const sheet = openSheet({ title: 'עריכת משימה', body: h('div', { class: 'form' }, quick, form.el), footer: saveBtn, headerActions: del });
}

// =====================================================================
// Category sheet
// =====================================================================
/** @param {Store} store @param {any} [cat] */
export function openCategorySheet(store, cat) {
  const d = { name: cat ? cat.name : '', color: cat ? cat.color : 'blue' };
  const saveBtn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: save }, cat ? 'שמירה' : 'הוספת קטגוריה'));
  saveBtn.disabled = !d.name.trim();
  const name = titleInput(d.name, 'שם הקטגוריה', (v) => { d.name = v; saveBtn.disabled = !v.trim(); }, save);
  name.maxLength = 40;
  const colors = colorSwatches({ value: d.color, onChange: (v) => { d.color = v || d.color; } });
  async function save() {
    const n = d.name.trim();
    if (!n) return;
    if (store.state.categories.some((c) => c.name === n && (!cat || c.id !== cat.id))) {
      toast('כבר קיימת קטגוריה בשם הזה.');
      return;
    }
    sheet.close();
    await store.saveCategory(cat ? { id: cat.id, name: n, color: d.color } : { name: n, color: d.color });
  }
  const del = cat ? h('button', {
    type: 'button', class: 'icon-btn is-danger', 'aria-label': 'מחיקת קטגוריה',
    onClick: async () => {
      const r = await choose({
        title: `למחוק את "${cat.name}"?`,
        message: 'הפעילויות והמשימות בקטגוריה יישארו, רק בלי קטגוריה.',
        options: [{ label: 'מחיקה', value: 'yes', tone: 'danger' }],
      });
      if (r !== 'yes') return;
      sheet.close();
      store.deleteCategory(cat.id);
    },
  }, icon('trash', 20)) : null;
  const sheet = openSheet({
    title: cat ? 'עריכת קטגוריה' : 'קטגוריה חדשה',
    body: h('div', { class: 'form form-stack' }, name, field('צבע', colors.el)),
    footer: saveBtn, headerActions: del,
  });
  if (!cat) name.focus();
}

// =====================================================================
// Password sheet
// =====================================================================
/** @param {Store} store */
export function openPasswordSheet(store) {
  const err = h('p', { class: 'field-error', role: 'alert' });
  err.hidden = true;
  const mk = (label, ac) => /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'password', 'aria-label': label, placeholder: label, autocomplete: ac, minlength: 6 }));
  const p1 = mk('סיסמה חדשה', 'new-password');
  const p2 = mk('הקלדה חוזרת', 'new-password');
  const btn = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: submit }, 'עדכון סיסמה'));
  const show = (m) => { err.textContent = m; err.hidden = false; };
  async function submit() {
    err.hidden = true;
    if (p1.value.length < 6) return show('הסיסמה צריכה להכיל לפחות 6 תווים.');
    if (p1.value !== p2.value) return show('הסיסמאות לא תואמות.');
    btn.disabled = true;
    try {
      await store.changePassword(p1.value);
      sheet.close();
      toast('הסיסמה עודכנה');
    } catch (e) {
      const code = e && e.code;
      show(code === 'same_password' ? 'זו כבר הסיסמה הנוכחית.' : code === 'weak_password' ? 'הסיסמה חלשה מדי. נסו סיסמה ארוכה יותר.' : errorText(e));
    } finally {
      btn.disabled = false;
    }
  }
  const sheet = openSheet({ title: 'החלפת סיסמה', body: h('div', { class: 'form form-stack' }, p1, p2, err), footer: btn });
  p1.focus();
}
