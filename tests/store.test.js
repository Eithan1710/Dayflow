import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser shims for the store.
const mem = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
});

const { createStore } = await import('../js/data/store.js');
const { AppError } = await import('../js/data/schema.js');
const { taskBucket } = await import('../js/ui/views.js');

/** In-memory backend that records calls and can be told to fail. */
function fakeBackend() {
  const db = { activities: new Map(), overrides: new Map(), tasks: new Map(), categories: [{ id: 'c1', name: 'כושר', color: 'orange', sort_order: 1 }] };
  const calls = [];
  let failNext = false;
  const io = async (name, fn) => {
    calls.push(name);
    if (failNext) { failNext = false; throw new AppError('offline'); }
    return fn();
  };
  return {
    db, calls, fail: () => { failNext = true; },
    async getSession() { return { userId: 'u1', username: 'demo' }; },
    onAuthChange() {},
    bootstrap: () => io('bootstrap', () => {}),
    loadProfile: () => io('profile', () => ({ theme: 'system' })),
    loadCategories: () => io('cats', () => db.categories),
    loadRecurring: () => io('recurring', () => [...db.activities.values()].filter((a) => a.repeat_freq)),
    loadTasks: () => io('tasks', () => [...db.tasks.values()]),
    loadRange: (from, to) => io('range', () => ({
      activities: [...db.activities.values()].filter((a) => !a.repeat_freq && a.start_date <= to && (a.end_date || a.start_date) >= from),
      overrides: [...db.overrides.values()],
    })),
    saveActivity: (a) => io('saveActivity', () => db.activities.set(a.id, { ...a })),
    deleteActivity: (id) => io('deleteActivity', () => db.activities.delete(id)),
    saveOverride: (o) => io('saveOverride', () => db.overrides.set(o.activity_id + '|' + o.occurrence_date, { ...o })),
    saveTask: (t) => io('saveTask', () => db.tasks.set(t.id, { ...t })),
    deleteTask: (id) => io('deleteTask', () => db.tasks.delete(id)),
    saveCategory: (c) => io('saveCategory', () => {}),
    deleteCategory: (id) => io('deleteCategory', () => {}),
    updateProfile: () => io('updateProfile', () => {}),
  };
}

let backend, store, errors;
const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(async () => {
  backend = fakeBackend();
  errors = [];
  store = createStore(backend, { onError: (m) => errors.push(m) });
  await store.init();
  store.state.date = '2026-11-23';
  store.state.today = '2026-11-23';
});

const draft = (extra = {}) => ({
  title: 'חדר כושר', start_date: '2026-11-23', end_date: null, period: 'evening', all_day: false,
  start_time: null, end_time: null, category_id: 'c1', color: null, location: null, priority: null, description: null,
  repeat_freq: null, repeat_interval: 1, repeat_weekdays: null, repeat_until: null, ...extra,
});

test('create activity is optimistic and persisted with a client id', async () => {
  const id = store.createActivity(draft());
  assert.equal(store.dayData('2026-11-23').byPeriod.evening.length, 1); // visible immediately
  await flush();
  assert.ok(backend.db.activities.has(id));
  assert.equal(store.state.status, 'ready');
});

test('failed save rolls back and reports an error in Hebrew', async () => {
  backend.fail();
  store.createActivity(draft({ title: 'יאבד' }));
  assert.equal(store.instancesOn('2026-11-23').length, 1);
  await flush();
  assert.equal(store.instancesOn('2026-11-23').length, 0);
  assert.match(errors[0], /אין חיבור/);
});

test('activities without times, with times, all-day and multi-day are grouped correctly', async () => {
  store.createActivity(draft({ title: 'בלי שעה', period: 'morning' }));
  store.createActivity(draft({ title: 'עם שעה', period: 'evening', start_time: '18:30', end_time: '19:30' }));
  store.createActivity(draft({ title: 'כל היום', all_day: true, period: null }));
  store.createActivity(draft({ title: 'טיול', start_date: '2026-11-22', end_date: '2026-11-24' }));
  await flush();
  const d = store.dayData('2026-11-23');
  assert.deepEqual(d.byPeriod.morning.map((i) => i.a.title), ['בלי שעה']);
  assert.deepEqual(d.byPeriod.evening.map((i) => i.a.title), ['עם שעה']);
  assert.deepEqual(d.spanning.map((i) => i.a.title).sort(), ['טיול', 'כל היום'].sort());
  const trip = d.spanning.find((i) => i.a.title === 'טיול');
  assert.equal(trip.spanIndex, 2);
  assert.equal(trip.spanCount, 3);
});

test('timed items sort before untimed ones in a period', async () => {
  store.createActivity(draft({ title: 'ב' }));
  store.createActivity(draft({ title: 'א', start_time: '20:00' }));
  await flush();
  assert.deepEqual(store.dayData('2026-11-23').byPeriod.evening.map((i) => i.a.title), ['א', 'ב']);
});

test('move a (multi-day) activity to another day', async () => {
  const id = store.createActivity(draft({ start_date: '2026-11-23', end_date: '2026-11-24' }));
  await flush();
  const inst = store.instancesOn('2026-11-23')[0];
  await store.moveInstance(inst, '2026-11-25');
  const a = store.state.activities.get(id);
  assert.equal(a.start_date, '2026-11-25');
  assert.equal(a.end_date, '2026-11-26');
  assert.equal(backend.db.activities.get(id).start_date, '2026-11-25');
});

test('recurring: per-occurrence completion, delete one, detach one', async () => {
  const id = store.createActivity(draft({ title: 'ריצה', repeat_freq: 'weekly', repeat_weekdays: [1, 3] })); // Mon+Wed
  await flush();
  const mon = store.instancesOn('2026-11-23')[0];
  assert.ok(mon.recurring);
  await store.toggleActivity(mon);
  assert.equal(store.instancesOn('2026-11-23')[0].completed, true);
  assert.equal(store.instancesOn('2026-11-25')[0].completed, false); // other occurrences untouched

  store.deleteActivity(store.instancesOn('2026-11-25')[0], 'this');
  await flush();
  assert.equal(store.instancesOn('2026-11-25').length, 0);
  assert.equal(store.instancesOn('2026-11-30').length, 1);

  await store.detachOccurrence(store.instancesOn('2026-11-30')[0], { title: 'ריצה ארוכה' });
  const nov30 = store.instancesOn('2026-11-30');
  assert.equal(nov30.length, 1);
  assert.equal(nov30[0].a.title, 'ריצה ארוכה');
  assert.equal(nov30[0].recurring, false);
  assert.ok(store.state.activities.has(id)); // series still exists
});

test('delete with undo restores the activity', async () => {
  store.createActivity(draft());
  await flush();
  const undo = store.deleteActivity(store.instancesOn('2026-11-23')[0]);
  await flush();
  assert.equal(store.instancesOn('2026-11-23').length, 0);
  undo();
  await flush();
  assert.equal(store.instancesOn('2026-11-23').length, 1);
  assert.equal(backend.db.activities.size, 1);
});

test('duplicate creates an independent copy', async () => {
  store.createActivity(draft());
  await flush();
  store.duplicateActivity(store.instancesOn('2026-11-23')[0]);
  await flush();
  assert.equal(store.instancesOn('2026-11-23').length, 2);
  assert.equal(backend.db.activities.size, 2);
});

test('tasks: create, schedule into a period, complete', async () => {
  const id = store.createTask({ title: 'לקנות מתנה' });
  await flush();
  await store.updateTask(id, { scheduled_date: '2026-11-23', period: 'afternoon' });
  assert.equal(store.dayData('2026-11-23').tasksByPeriod.afternoon.length, 1);
  await store.toggleTask(store.state.tasks.get(id));
  assert.equal(backend.db.tasks.get(id).completed, true);
  assert.ok(backend.db.tasks.get(id).completed_at);
  await store.updateTask(id, { scheduled_date: null });
  assert.equal(store.state.tasks.get(id).period, null); // period cleared with the date
});

test('overdue unscheduled tasks surface on today', async () => {
  store.createTask({ title: 'דחוף', due_date: '2026-11-20' });
  await flush();
  assert.equal(store.dayData('2026-11-23').looseTasks.length, 1);
  assert.equal(store.dayData('2026-11-24').looseTasks.length, 0);
});

test('task buckets', () => {
  const today = '2026-11-23';
  assert.equal(taskBucket({ due_date: '2026-11-20' }, today), 0);
  assert.equal(taskBucket({ scheduled_date: '2026-11-23' }, today), 1);
  assert.equal(taskBucket({ due_date: '2026-11-20', scheduled_date: '2026-11-25' }, today), 2);
  assert.equal(taskBucket({}, today), 3);
});

test('view navigation keeps the selected date', () => {
  store.setDate('2026-11-23');
  store.setView('week');
  assert.equal(store.state.date, '2026-11-23');
  store.step(1);
  assert.equal(store.state.date, '2026-11-30');
  store.setView('month');
  store.step(1);
  assert.equal(store.state.date, '2026-12-30');
  store.openDay('2026-12-02');
  assert.equal(store.state.view, 'day');
  assert.equal(store.state.date, '2026-12-02');
});

test('deleting a category clears it from items locally', async () => {
  const id = store.createActivity(draft());
  await flush();
  await store.deleteCategory('c1');
  assert.equal(store.state.activities.get(id).category_id, null);
  assert.equal(store.state.categories.length, 0);
});

test('drag to another period: keeps fitting times, clears others, undo restores', async () => {
  const id = store.createActivity(draft({ title: 'חדר כושר', period: 'evening', start_time: '18:30', end_time: '19:30' }));
  await flush();
  const inst = store.instancesOn('2026-11-23')[0];
  assert.equal(store.moveToPeriod(inst, 'evening'), null); // same period: nothing to do
  const res = store.moveToPeriod(inst, 'night');
  await flush();
  assert.equal(res.timeCleared, true);
  const a = store.state.activities.get(id);
  assert.equal(a.period, 'night');
  assert.equal(a.start_time, null);
  assert.equal(backend.db.activities.get(id).period, 'night');
  await res.undo();
  assert.equal(store.state.activities.get(id).period, 'evening');
  assert.equal(store.state.activities.get(id).start_time, '18:30');

  const id2 = store.createActivity(draft({ title: 'ערב', period: 'afternoon', start_time: '19:00' }));
  await flush();
  const r2 = store.moveToPeriod(store.instancesOn('2026-11-23').find((i) => i.a.id === id2), 'evening');
  assert.equal(r2.timeCleared, false);
  assert.equal(store.state.activities.get(id2).start_time, '19:00');
});

test('drag an all-day item into a period', async () => {
  const id = store.createActivity(draft({ all_day: true, period: null }));
  await flush();
  store.moveToPeriod(store.instancesOn('2026-11-23')[0], 'noon');
  await flush();
  assert.equal(store.state.activities.get(id).all_day, false);
  assert.equal(store.dayData('2026-11-23').byPeriod.noon.length, 1);
});

test('drag a recurring occurrence: this one only vs whole series', async () => {
  const id = store.createActivity(draft({ title: 'ריצה', period: 'morning', repeat_freq: 'daily' }));
  await flush();
  store.moveToPeriod(store.instancesOn('2026-11-23')[0], 'evening', 'this');
  await flush();
  assert.equal(store.dayData('2026-11-23').byPeriod.evening.length, 1);
  assert.equal(store.dayData('2026-11-24').byPeriod.morning.length, 1); // rest of series unchanged
  store.moveToPeriod(store.instancesOn('2026-11-24')[0], 'night', 'all');
  await flush();
  assert.equal(store.state.activities.get(id).period, 'night');
});

test('drag a task into a period schedules it on that day', async () => {
  const id = store.createTask({ title: 'דחוף', due_date: '2026-11-20' });
  await flush();
  const undo = store.moveTaskToPeriod(store.state.tasks.get(id), '2026-11-23', 'noon');
  await flush();
  assert.equal(store.dayData('2026-11-23').tasksByPeriod.noon.length, 1);
  assert.equal(backend.db.tasks.get(id).scheduled_date, '2026-11-23');
  await undo();
  assert.equal(store.state.tasks.get(id).scheduled_date, null);
});

test('reorder inside a part of the day: activities and tasks share one order', async () => {
  const gym = store.createActivity(draft({ title: 'חדר כושר', period: 'late_morning' }));
  const pkg = store.createTask({ title: 'לאסוף חבילה', scheduled_date: '2026-11-23', period: 'late_morning' });
  await flush();
  const titles = () => store.dayData('2026-11-23').itemsByPeriod.late_morning.map((e) => (e.kind === 'activity' ? e.inst.a.title : e.t.title));
  assert.deepEqual(titles(), ['חדר כושר', 'לאסוף חבילה']); // automatic: activities first

  const calls = backend.calls.length;
  assert.equal(store.arrangePeriod('2026-11-23', 'late_morning', { kind: 'task', id: pkg }, 1).changed, false); // same spot
  assert.equal(backend.calls.length, calls);

  const r = store.arrangePeriod('2026-11-23', 'late_morning', { kind: 'task', id: pkg }, 0);
  await flush();
  assert.equal(r.changed, true);
  assert.equal(r.periodChanged, false);
  assert.deepEqual(titles(), ['לאסוף חבילה', 'חדר כושר']);
  assert.equal(backend.db.tasks.get(pkg).period_order, 1000);
  assert.equal(backend.db.activities.get(gym).period_order, 2000);

  // a new item without a manual position goes to the end
  store.createActivity(draft({ title: 'קפה', period: 'late_morning', start_time: '09:30' }));
  await flush();
  assert.deepEqual(titles(), ['לאסוף חבילה', 'חדר כושר', 'קפה']);

  r.undo();
  await flush();
  assert.equal(store.state.tasks.get(pkg).period_order, null);
});

test('drag from another part of the day to a specific position', async () => {
  store.createActivity(draft({ title: 'א', period: 'evening' }));
  store.createActivity(draft({ title: 'ב', period: 'evening' }));
  const moving = store.createActivity(draft({ title: 'נכנס', period: 'morning', start_time: '07:00' }));
  await flush();
  const inst = store.instancesOn('2026-11-23').find((i) => i.a.id === moving);
  const r = store.arrangePeriod('2026-11-23', 'evening', { kind: 'activity', id: moving, inst }, 1);
  await flush();
  assert.equal(r.periodChanged, true);
  assert.equal(r.timeCleared, true);
  assert.deepEqual(store.dayData('2026-11-23').itemsByPeriod.evening.map((e) => e.inst.a.title), ['א', 'נכנס', 'ב']);
  assert.equal(backend.db.activities.get(moving).period, 'evening');
  r.undo();
  await flush();
  assert.equal(store.state.activities.get(moving).period, 'morning');
  assert.equal(store.state.activities.get(moving).start_time, '07:00');
});

test('recurring occurrence dragged to another period "this one only" lands at the chosen spot', async () => {
  store.createActivity(draft({ title: 'קיים', period: 'night' }));
  const series = store.createActivity(draft({ title: 'ריצה', period: 'morning', repeat_freq: 'daily' }));
  await flush();
  const inst = store.instancesOn('2026-11-23').find((i) => i.a.id === series);
  store.arrangePeriod('2026-11-23', 'night', { kind: 'activity', id: series, inst }, 0, 'this');
  await flush();
  assert.deepEqual(store.dayData('2026-11-23').itemsByPeriod.night.map((e) => e.inst.a.title), ['ריצה', 'קיים']);
  assert.equal(store.dayData('2026-11-24').itemsByPeriod.morning.length, 1); // series untouched
});
