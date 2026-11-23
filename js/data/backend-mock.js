// In-browser mock backend, used only for local development and automated UI tests
// (http://localhost/?mock). It mirrors the Supabase backend API and the database's
// CHECK constraints so UI bugs surface the same way they would in production.
import { ACTIVITY_COLUMNS, AppError, CATEGORY_COLUMNS, OVERRIDE_COLUMNS, TASK_COLUMNS, pick } from './schema.js';

const DB_KEY = 'dayflow:mock-db';
const SESSION_KEY = 'dayflow:mock-session';
const USERS = {
  demo: { id: '00000000-0000-4000-8000-00000000d001', password: 'demo1234', member: true },
  other: { id: '00000000-0000-4000-8000-00000000d002', password: 'other1234', member: true },
  stranger: { id: '00000000-0000-4000-8000-00000000d003', password: 'stranger1', member: false },
};
const PERIODS = ['morning', 'late_morning', 'noon', 'afternoon', 'evening', 'night'];

function loadDb() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '') || { rows: {} };
  } catch {
    return { rows: {} };
  }
}

export function createMockBackend() {
  const db = loadDb();
  const save = () => localStorage.setItem(DB_KEY, JSON.stringify(db));
  /** @type {{userId: string, username: string} | null} */
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
  /** @type {((b: boolean) => void)[]} */
  const authCbs = [];

  const delay = () => new Promise((r) => setTimeout(r, 120));
  async function gate() {
    await delay();
    // Test hook: window.__mockFail = true makes the next request fail like a lost connection.
    if (/** @type {any} */ (window).__mockFail) {
      /** @type {any} */ (window).__mockFail = false;
      throw new AppError('offline', 'mock failure');
    }
    if (!session) throw new AppError('forbidden');
  }
  /** @param {string} table */
  function rows(table) {
    const uid = /** @type {any} */ (session).userId;
    db.rows[uid] ||= { categories: [], activities: [], overrides: [], tasks: [], profile: null };
    return db.rows[uid][table];
  }
  const now = () => new Date().toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function validateActivity(a) {
    const bad = (m) => { throw new AppError('server', 'check violation: ' + m); };
    if (!a.title || !a.title.trim() || a.title.length > 200) bad('title');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.start_date)) bad('start_date');
    if (a.end_date && a.end_date < a.start_date) bad('end_date');
    if (a.period && !PERIODS.includes(a.period)) bad('period');
    if (!a.all_day && !a.period) bad('slot');
    if (a.end_time && !a.start_time) bad('end_time');
    if (a.repeat_until && a.repeat_until < a.start_date) bad('until');
    if (a.repeat_freq && a.end_date && a.end_date !== a.start_date) bad('repeat_single_day');
    if (a.category_id && !rows('categories').some((c) => c.id === a.category_id)) bad('category fk');
  }
  function validateTask(t) {
    if (!t.title || !t.title.trim()) throw new AppError('server', 'check violation: title');
    if (t.period && !t.scheduled_date) throw new AppError('server', 'check violation: period');
  }

  /** @param {string} table @param {any} row @param {string|string[]} [key] */
  function upsert(table, row, key = 'id') {
    const list = rows(table);
    const match = (r) => (Array.isArray(key) ? key.every((k) => r[k] === row[k]) : r[key] === row[key]);
    const i = list.findIndex(match);
    if (i >= 0) list[i] = { ...list[i], ...row, updated_at: now() };
    else list.push({ created_at: now(), updated_at: now(), ...row });
    save();
  }

  return {
    kind: 'mock',
    async getSession() {
      return session;
    },
    async signIn(username, password) {
      await delay();
      const u = USERS[username.trim().toLowerCase()];
      if (!u || u.password !== password) throw new AppError('bad_credentials');
      if (!u.member) throw new AppError('not_member');
      session = { userId: u.id, username: username.trim() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },
    async signOut() {
      session = null;
      localStorage.removeItem(SESSION_KEY);
      authCbs.forEach((cb) => cb(false));
    },
    onAuthChange(cb) {
      authCbs.push(cb);
    },
    async changePassword(password) {
      await gate();
      if (password.length < 6) throw new AppError('weak_password');
      const u = Object.values(USERS).find((x) => x.id === session?.userId);
      if (u) u.password = password;
    },
    async bootstrap() {
      await gate();
      const uid = /** @type {any} */ (session).userId;
      db.rows[uid] ||= { categories: [], activities: [], overrides: [], tasks: [], profile: null };
      const r = db.rows[uid];
      r.profile ||= { id: uid, display_name: null, theme: 'system' };
      if (!r.categories.length) {
        const defs = [['עבודה', 'blue'], ['צבא', 'green'], ['כושר', 'orange'], ['חברים', 'violet'],
          ['משפחה', 'rose'], ['אישי', 'teal'], ['בילויים', 'amber'], ['אחר', 'slate']];
        defs.forEach(([name, color], i) => r.categories.push({ id: crypto.randomUUID(), name, color, sort_order: i + 1 }));
      }
      save();
    },
    async loadProfile() {
      await gate();
      return clone(db.rows[/** @type {any} */ (session).userId].profile);
    },
    async updateProfile(_userId, patch) {
      await gate();
      Object.assign(db.rows[/** @type {any} */ (session).userId].profile, patch);
      save();
    },
    async loadCategories() {
      await gate();
      return clone(rows('categories')).sort((a, b) => a.sort_order - b.sort_order);
    },
    async loadRange(from, to) {
      await gate();
      const acts = rows('activities').filter((a) => !a.repeat_freq && a.start_date <= to && (a.end_date || a.start_date) >= from);
      const ovs = rows('overrides').filter((o) => o.occurrence_date >= from && o.occurrence_date <= to);
      return { activities: clone(acts), overrides: clone(ovs) };
    },
    async loadRecurring() {
      await gate();
      return clone(rows('activities').filter((a) => a.repeat_freq));
    },
    async loadTasks() {
      await gate();
      return clone(rows('tasks'));
    },
    async saveActivity(a) {
      await gate();
      const row = pick(a, ACTIVITY_COLUMNS);
      validateActivity({ ...rows('activities').find((x) => x.id === a.id), ...row });
      upsert('activities', row);
    },
    async deleteActivity(id) {
      await gate();
      const r = db.rows[/** @type {any} */ (session).userId];
      r.activities = r.activities.filter((a) => a.id !== id);
      r.overrides = r.overrides.filter((o) => o.activity_id !== id);
      save();
    },
    async saveOverride(o) {
      await gate();
      if (!rows('activities').some((a) => a.id === o.activity_id)) throw new AppError('server', 'fk');
      upsert('overrides', pick(o, OVERRIDE_COLUMNS), ['activity_id', 'occurrence_date']);
    },
    async saveTask(t) {
      await gate();
      const row = pick(t, TASK_COLUMNS);
      validateTask({ ...rows('tasks').find((x) => x.id === t.id), ...row });
      upsert('tasks', row);
    },
    async deleteTask(id) {
      await gate();
      const r = db.rows[/** @type {any} */ (session).userId];
      r.tasks = r.tasks.filter((t) => t.id !== id);
      save();
    },
    async saveCategory(c) {
      await gate();
      const row = pick(c, CATEGORY_COLUMNS);
      if (rows('categories').some((x) => x.name === row.name && x.id !== row.id)) throw new AppError('duplicate');
      upsert('categories', row);
    },
    async deleteCategory(id) {
      await gate();
      const r = db.rows[/** @type {any} */ (session).userId];
      r.categories = r.categories.filter((c) => c.id !== id);
      for (const a of r.activities) if (a.category_id === id) a.category_id = null;
      for (const t of r.tasks) if (t.category_id === id) t.category_id = null;
      save();
    },
  };
}
