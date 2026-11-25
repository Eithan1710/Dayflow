// Column whitelists: only these fields are ever sent to the database.
export const ACTIVITY_COLUMNS = [
  'id', 'category_id', 'title', 'description', 'start_date', 'end_date', 'period', 'all_day',
  'start_time', 'end_time', 'color', 'location', 'priority', 'completed', 'completed_at',
  'repeat_freq', 'repeat_interval', 'repeat_weekdays', 'repeat_until', 'period_order',
];
export const TASK_COLUMNS = [
  'id', 'category_id', 'title', 'description', 'due_date', 'scheduled_date', 'period',
  'priority', 'completed', 'completed_at', 'sort_order', 'period_order',
];
export const CATEGORY_COLUMNS = ['id', 'name', 'color', 'sort_order'];
export const OVERRIDE_COLUMNS = ['activity_id', 'occurrence_date', 'completed', 'cancelled'];

export const COLORS = ['slate', 'blue', 'indigo', 'violet', 'rose', 'orange', 'amber', 'green', 'teal'];

/** @param {Record<string, any>} obj @param {string[]} cols */
export function pick(obj, cols) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const c of cols) if (obj[c] !== undefined) out[c] = obj[c];
  return out;
}

/** Normalizes values coming from Postgres (time "08:30:00" -> "08:30"). */
export function normalizeActivity(a) {
  return {
    ...a,
    start_time: a.start_time ? a.start_time.slice(0, 5) : null,
    end_time: a.end_time ? a.end_time.slice(0, 5) : null,
  };
}

/** Collision-free client ids make creates idempotent (safe to retry). */
export function newId() {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) return globalThis.crypto.randomUUID();
  // RFC4122 v4 fallback for older browsers
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Username -> synthetic auth e-mail (hex of the UTF-8 bytes, so Hebrew works). */
export function usernameToEmail(username, domain) {
  const bytes = new TextEncoder().encode(username.trim().toLowerCase());
  return `u-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}@${domain}`;
}

export class AppError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}
