// Application state + actions. All mutations are optimistic: the UI updates
// immediately, the request runs in the background, and any failure rolls back.
import {
  addDays, addMonths, dayDiff, endOfMonth, monthGrid, monthKey, startOfMonth, todayKey,
} from '../lib/dates.js';
import { PERIOD_IDS } from '../lib/periods.js';
import { isMultiDay, occursOn } from '../lib/recurrence.js';
import { STORAGE_PREFIX } from '../config.js';
import { AppError, newId } from './schema.js';

/** @typedef {import('../lib/recurrence.js').Activity} Activity */
/**
 * @typedef {Object} Instance
 * @property {string} key
 * @property {Activity} a
 * @property {string} date
 * @property {boolean} completed
 * @property {boolean} recurring
 * @property {number} spanIndex   1-based day within a multi-day activity
 * @property {number} spanCount
 */

export const ERROR_TEXT = {
  offline: 'אין חיבור לאינטרנט, השינוי לא נשמר.',
  forbidden: 'פג תוקף ההתחברות. צריך להיכנס שוב.',
  duplicate: 'כבר קיימת קטגוריה בשם הזה.',
  server: 'השמירה נכשלה. נסו שוב.',
  load: 'לא הצלחנו לטעון את הנתונים. בדקו את החיבור ונסו שוב.',
};

/** @param {any} e */
export function errorText(e) {
  return (e instanceof AppError && ERROR_TEXT[e.code]) || ERROR_TEXT.server;
}

const ovKey = (activityId, date) => `${activityId}|${date}`;

/**
 * @param {any} backend
 * @param {{ onError: (msg: string) => void }} hooks
 */
export function createStore(backend, hooks) {
  const state = {
    /** @type {'loading'|'signed_out'|'ready'} */
    status: 'loading',
    /** @type {{userId: string, username: string} | null} */
    session: null,
    /** @type {{theme: string} | null} */
    profile: null,
    /** @type {'plan'|'tasks'|'settings'} */
    tab: 'plan',
    /** @type {'day'|'week'|'month'} */
    view: 'day',
    date: todayKey(),
    today: todayKey(),
    /** @type {any[]} */
    categories: [],
    /** @type {Map<string, Activity>} */
    activities: new Map(),
    /** @type {Map<string, any>} */
    overrides: new Map(),
    /** @type {Map<string, any>} */
    tasks: new Map(),
    loadedMonths: new Set(),
    loadingMonths: new Set(),
    /** @type {'open'|'done'} */
    taskFilter: 'open',
    loadError: false,
  };
  let pending = 0;

  // ---------- subscription ----------
  /** @type {Set<() => void>} */
  const listeners = new Set();
  let queued = false;
  function emit() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      listeners.forEach((f) => f());
    });
  }

  /**
   * Applies a change immediately, then persists it. On failure the change is undone.
   * @param {() => void} apply @param {() => void} rollback @param {() => Promise<any>} request
   */
  async function optimistic(apply, rollback, request) {
    apply();
    emit();
    pending++;
    try {
      await request();
      return true;
    } catch (e) {
      rollback();
      emit();
      hooks.onError(errorText(e));
      if (e instanceof AppError && e.code === 'forbidden') void handleExpired();
      return false;
    } finally {
      pending--;
    }
  }

  async function handleExpired() {
    const s = await backend.getSession();
    if (!s) signedOut();
  }

  // ---------- auth & loading ----------
  function signedOut() {
    state.status = 'signed_out';
    state.session = null;
    state.activities = new Map();
    state.overrides = new Map();
    state.tasks = new Map();
    state.categories = [];
    state.loadedMonths = new Set();
    emit();
  }

  async function init() {
    backend.onAuthChange((signedIn) => {
      if (!signedIn && state.status === 'ready') signedOut();
    });
    const session = await backend.getSession().catch(() => null);
    if (!session) return signedOut();
    state.session = session;
    await loadAll();
  }

  async function signIn(username, password) {
    const session = await backend.signIn(username, password);
    state.session = session;
    state.status = 'loading';
    state.tab = 'plan';
    state.view = 'day';
    state.date = state.today = todayKey();
    emit();
    await loadAll();
  }

  async function signOut() {
    await backend.signOut().catch(() => {});
    signedOut();
  }

  async function loadAll() {
    state.loadError = false;
    try {
      await backend.bootstrap();
      const [profile, categories, recurring, tasks] = await Promise.all([
        backend.loadProfile(), backend.loadCategories(), backend.loadRecurring(), backend.loadTasks(),
      ]);
      state.profile = profile;
      state.categories = categories;
      state.activities = new Map(recurring.map((a) => [a.id, a]));
      state.overrides = new Map();
      state.tasks = new Map(tasks.map((t) => [t.id, t]));
      state.loadedMonths = new Set();
      if (profile && profile.theme) localStorage.setItem(STORAGE_PREFIX + 'theme', profile.theme);
      await ensureLoaded();
      state.status = 'ready';
    } catch (e) {
      if (e instanceof AppError && e.code === 'forbidden') {
        await backend.signOut().catch(() => {});
        signedOut();
        hooks.onError('החשבון הזה לא מורשה להשתמש ב-Dayflow.');
        return;
      }
      state.status = 'ready';
      state.loadError = true;
    }
    emit();
  }

  /** Re-fetches everything (e.g. when the app comes back to the foreground). */
  async function refresh() {
    if (state.status !== 'ready' || pending > 0) return;
    const today = todayKey();
    if (today !== state.today) {
      // Day changed while the app was open: follow "today" if the user was on it.
      if (state.date === state.today) state.date = today;
      state.today = today;
    }
    try {
      const [categories, recurring, tasks] = await Promise.all([
        backend.loadCategories(), backend.loadRecurring(), backend.loadTasks(),
      ]);
      const months = [...state.loadedMonths];
      const ranges = await Promise.all(months.map((m) => backend.loadRange(startOfMonth(m + '-01'), endOfMonth(m + '-01'))));
      if (pending > 0) return; // a local change started meanwhile; keep local state
      state.categories = categories;
      state.tasks = new Map(tasks.map((t) => [t.id, t]));
      const acts = new Map(recurring.map((a) => [a.id, a]));
      const ovs = new Map();
      for (const r of ranges) {
        r.activities.forEach((a) => acts.set(a.id, a));
        r.overrides.forEach((o) => ovs.set(ovKey(o.activity_id, o.occurrence_date), o));
      }
      state.activities = acts;
      state.overrides = ovs;
      state.loadError = false;
      emit();
    } catch {
      /* stay with cached data */
    }
  }

  /** Loads the months the current view needs, plus neighbours in the background. */
  async function ensureLoaded() {
    const grid = monthGrid(state.date);
    const needed = new Set([monthKey(grid[0]), monthKey(state.date), monthKey(grid[grid.length - 1])]);
    const prefetch = [monthKey(addMonths(state.date, 1)), monthKey(addMonths(state.date, -1))];
    const load = async (m) => {
      if (state.loadedMonths.has(m) || state.loadingMonths.has(m)) return;
      state.loadingMonths.add(m);
      try {
        const first = m + '-01';
        const { activities, overrides } = await backend.loadRange(startOfMonth(first), endOfMonth(first));
        activities.forEach((a) => { if (!state.activities.has(a.id)) state.activities.set(a.id, a); });
        overrides.forEach((o) => {
          const k = ovKey(o.activity_id, o.occurrence_date);
          if (!state.overrides.has(k)) state.overrides.set(k, o);
        });
        state.loadedMonths.add(m);
      } finally {
        state.loadingMonths.delete(m);
      }
    };
    await Promise.all([...needed].map(load));
    emit();
    Promise.all(prefetch.map(load)).then(emit, () => {});
  }

  // ---------- navigation ----------
  function setDate(k) {
    state.date = k;
    emit();
    ensureLoaded().catch(() => {
      state.loadError = true;
      emit();
    });
  }
  /** @param {'day'|'week'|'month'} view */
  function setView(view) {
    state.view = view;
    state.tab = 'plan';
    emit();
  }
  /** @param {'plan'|'tasks'|'settings'} tab */
  function setTab(tab) {
    state.tab = tab;
    emit();
  }
  function step(dir) {
    const v = state.view;
    setDate(v === 'day' ? addDays(state.date, dir) : v === 'week' ? addDays(state.date, 7 * dir) : addMonths(state.date, dir));
  }
  function goToday() {
    state.today = todayKey();
    setDate(state.today);
  }
  function openDay(k) {
    state.view = 'day';
    state.tab = 'plan';
    setDate(k);
  }

  // ---------- selectors ----------
  /** @param {string} k @returns {Instance[]} */
  function instancesOn(k) {
    /** @type {Instance[]} */
    const out = [];
    for (const a of state.activities.values()) {
      if (!occursOn(a, k)) continue;
      const ov = a.repeat_freq ? state.overrides.get(ovKey(a.id, k)) : null;
      if (ov && ov.cancelled) continue;
      const span = isMultiDay(a) ? dayDiff(a.start_date, /** @type {string} */ (a.end_date)) + 1 : 1;
      out.push({
        key: ovKey(a.id, k),
        a,
        date: k,
        completed: a.repeat_freq ? !!(ov && ov.completed) : !!a.completed,
        recurring: !!a.repeat_freq,
        spanIndex: span > 1 ? dayDiff(a.start_date, k) + 1 : 1,
        spanCount: span,
      });
    }
    return out.sort(compareInstances);
  }

  function compareInstances(x, y) {
    const tx = x.a.start_time || '99', ty = y.a.start_time || '99';
    if (tx !== ty) return tx < ty ? -1 : 1;
    return String(x.a.created_at || '').localeCompare(String(y.a.created_at || ''));
  }

  /** Everything the day screen needs, grouped. @param {string} k */
  function dayData(k) {
    const spanning = [];
    /** @type {Record<string, Instance[]>} */
    const byPeriod = Object.fromEntries(PERIOD_IDS.map((p) => [p, []]));
    /** @type {Record<string, any[]>} */
    const tasksByPeriod = Object.fromEntries(PERIOD_IDS.map((p) => [p, []]));
    const looseTasks = [];
    for (const inst of instancesOn(k)) {
      if (inst.a.all_day || inst.spanCount > 1 || !inst.a.period) spanning.push(inst);
      else byPeriod[inst.a.period].push(inst);
    }
    for (const t of state.tasks.values()) {
      if (t.scheduled_date === k) {
        if (t.period) tasksByPeriod[t.period].push(t);
        else looseTasks.push(t);
      } else if (!t.scheduled_date && !t.completed && t.due_date && k === state.today && t.due_date <= k) {
        looseTasks.push(t); // due today or overdue: surface on today's page
      }
    }
    return { spanning, byPeriod, tasksByPeriod, looseTasks };
  }

  function category(id) {
    return id ? state.categories.find((c) => c.id === id) || null : null;
  }
  /** Color key for an activity: own color, else its category's, else neutral. */
  function colorOf(item) {
    return item.color || (category(item.category_id) || {}).color || 'slate';
  }

  // ---------- activities ----------
  const putActivity = (a) => state.activities.set(a.id, a);
  const dropActivity = (id) => state.activities.delete(id);

  /** Creates a new activity. Returns its id. */
  function createActivity(draft) {
    const a = { ...draft, id: newId(), completed: false, completed_at: null, created_at: new Date().toISOString() };
    void optimistic(() => putActivity(a), () => dropActivity(a.id), () => backend.saveActivity(a));
    return a.id;
  }

  /** Updates a whole series / single activity. */
  function updateActivity(id, patch) {
    const before = state.activities.get(id);
    if (!before) return;
    const after = { ...before, ...patch };
    return optimistic(() => putActivity(after), () => putActivity(before), () => backend.saveActivity(after));
  }

  /** Splits one occurrence off a recurring series and applies `patch` to it. */
  function detachOccurrence(inst, patch) {
    const base = inst.a;
    const copy = {
      ...base, ...patch,
      id: newId(),
      repeat_freq: null, repeat_interval: 1, repeat_weekdays: null, repeat_until: null,
      end_date: null,
      completed: patch.completed ?? inst.completed,
      created_at: new Date().toISOString(),
    };
    if (!patch.start_date) copy.start_date = inst.date;
    const k = ovKey(base.id, inst.date);
    const prevOv = state.overrides.get(k);
    const ov = { activity_id: base.id, occurrence_date: inst.date, completed: false, cancelled: true };
    return optimistic(
      () => { putActivity(copy); state.overrides.set(k, ov); },
      () => { dropActivity(copy.id); prevOv ? state.overrides.set(k, prevOv) : state.overrides.delete(k); },
      async () => {
        await backend.saveActivity(copy);
        await backend.saveOverride(ov);
      },
    );
  }

  /** @param {Instance} inst */
  function toggleActivity(inst) {
    const a = inst.a;
    if (a.repeat_freq) {
      const k = ovKey(a.id, inst.date);
      const prev = state.overrides.get(k);
      const next = { activity_id: a.id, occurrence_date: inst.date, completed: !inst.completed, cancelled: false };
      return optimistic(
        () => state.overrides.set(k, next),
        () => (prev ? state.overrides.set(k, prev) : state.overrides.delete(k)),
        () => backend.saveOverride(next),
      );
    }
    const done = !a.completed;
    return updateActivity(a.id, { completed: done, completed_at: done ? new Date().toISOString() : null });
  }

  /** Moves an occurrence to another day (single activities shift as a whole). */
  function moveInstance(inst, newDate) {
    if (inst.recurring) return detachOccurrence(inst, { start_date: newDate });
    const delta = dayDiff(inst.date, newDate);
    const a = inst.a;
    return updateActivity(a.id, {
      start_date: addDays(a.start_date, delta),
      end_date: a.end_date ? addDays(a.end_date, delta) : null,
    });
  }

  function duplicateActivity(inst) {
    const { id, created_at, ...rest } = inst.a;
    const draft = inst.recurring
      ? { ...rest, start_date: inst.date, repeat_freq: null, repeat_interval: 1, repeat_weekdays: null, repeat_until: null }
      : rest;
    return createActivity(draft);
  }

  /**
   * Deletes an activity (scope 'all') or just one occurrence of a series (scope 'this').
   * Returns an undo function.
   */
  function deleteActivity(inst, scope = 'all') {
    const a = inst.a;
    if (scope === 'this' && inst.recurring) {
      const k = ovKey(a.id, inst.date);
      const prev = state.overrides.get(k);
      const ov = { activity_id: a.id, occurrence_date: inst.date, completed: inst.completed, cancelled: true };
      void optimistic(
        () => state.overrides.set(k, ov),
        () => (prev ? state.overrides.set(k, prev) : state.overrides.delete(k)),
        () => backend.saveOverride(ov),
      );
      return () => {
        const restored = { ...ov, cancelled: false };
        void optimistic(() => state.overrides.set(k, restored), () => state.overrides.set(k, ov), () => backend.saveOverride(restored));
      };
    }
    const ownOverrides = [...state.overrides.entries()].filter(([, o]) => o.activity_id === a.id);
    void optimistic(
      () => { dropActivity(a.id); ownOverrides.forEach(([k]) => state.overrides.delete(k)); },
      () => { putActivity(a); ownOverrides.forEach(([k, o]) => state.overrides.set(k, o)); },
      () => backend.deleteActivity(a.id),
    );
    return () => {
      void optimistic(
        () => { putActivity(a); ownOverrides.forEach(([k, o]) => state.overrides.set(k, o)); },
        () => dropActivity(a.id),
        async () => {
          await backend.saveActivity(a);
          for (const [, o] of ownOverrides) await backend.saveOverride(o);
        },
      );
    };
  }

  // ---------- tasks ----------
  function createTask(draft) {
    const t = {
      priority: null, description: null, due_date: null, scheduled_date: null, period: null, category_id: null,
      ...draft, id: newId(), completed: false, completed_at: null, sort_order: 0, created_at: new Date().toISOString(),
    };
    void optimistic(() => state.tasks.set(t.id, t), () => state.tasks.delete(t.id), () => backend.saveTask(t));
    return t.id;
  }
  function updateTask(id, patch) {
    const before = state.tasks.get(id);
    if (!before) return;
    const after = { ...before, ...patch };
    if (!after.scheduled_date) after.period = null;
    return optimistic(() => state.tasks.set(id, after), () => state.tasks.set(id, before), () => backend.saveTask(after));
  }
  function toggleTask(t) {
    const done = !t.completed;
    return updateTask(t.id, { completed: done, completed_at: done ? new Date().toISOString() : null });
  }
  /** Returns an undo function. */
  function deleteTask(t) {
    void optimistic(() => state.tasks.delete(t.id), () => state.tasks.set(t.id, t), () => backend.deleteTask(t.id));
    return () => void optimistic(() => state.tasks.set(t.id, t), () => state.tasks.delete(t.id), () => backend.saveTask(t));
  }

  // ---------- categories ----------
  function saveCategory(c) {
    const isNew = !c.id;
    const cat = isNew
      ? { ...c, id: newId(), sort_order: Math.max(0, ...state.categories.map((x) => x.sort_order)) + 1 }
      : { ...state.categories.find((x) => x.id === c.id), ...c };
    const before = state.categories;
    return optimistic(
      () => { state.categories = isNew ? [...before, cat] : before.map((x) => (x.id === cat.id ? cat : x)); },
      () => { state.categories = before; },
      () => backend.saveCategory(cat),
    );
  }
  function deleteCategory(id) {
    const before = state.categories;
    const touchedActs = [...state.activities.values()].filter((a) => a.category_id === id);
    const touchedTasks = [...state.tasks.values()].filter((t) => t.category_id === id);
    return optimistic(
      () => {
        state.categories = before.filter((c) => c.id !== id);
        touchedActs.forEach((a) => putActivity({ ...a, category_id: null }));
        touchedTasks.forEach((t) => state.tasks.set(t.id, { ...t, category_id: null }));
      },
      () => {
        state.categories = before;
        touchedActs.forEach(putActivity);
        touchedTasks.forEach((t) => state.tasks.set(t.id, t));
      },
      () => backend.deleteCategory(id),
    );
  }

  // ---------- profile ----------
  function setTheme(theme) {
    localStorage.setItem(STORAGE_PREFIX + 'theme', theme);
    const before = state.profile;
    return optimistic(
      () => { state.profile = { ...(before || {}), theme }; },
      () => { state.profile = before; },
      () => backend.updateProfile(state.session && state.session.userId, { theme }),
    );
  }

  async function changePassword(pw) {
    return backend.changePassword(pw);
  }

  return {
    state,
    subscribe: (f) => (listeners.add(f), () => listeners.delete(f)),
    emit,
    init, signIn, signOut, loadAll, refresh, ensureLoaded,
    setDate, setView, setTab, step, goToday, openDay,
    instancesOn, dayData, category, colorOf,
    createActivity, updateActivity, detachOccurrence, toggleActivity, moveInstance, duplicateActivity, deleteActivity,
    createTask, updateTask, toggleTask, deleteTask,
    saveCategory, deleteCategory, setTheme, changePassword,
    get pending() { return pending; },
  };
}
