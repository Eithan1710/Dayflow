// Date helpers. Dates are handled as local "YYYY-MM-DD" keys so no timezone
// conversion can ever shift an activity to another day.

/** @param {number} n */
export const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} d @returns {string} */
export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {string} key @returns {Date} local midnight */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

/** @param {string} key @param {number} n */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** @param {number} y @param {number} m0 */
export function daysInMonth(y, m0) {
  return new Date(y, m0 + 1, 0).getDate();
}

/** Adds months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(key, n) {
  const d = parseKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toKey(d);
}

/** Whole days from a to b (b - a). DST-safe. */
export function dayDiff(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key) {
  return parseKey(key).getDay();
}

/** Week starts on Sunday (Israel). */
export function startOfWeek(key) {
  return addDays(key, -weekday(key));
}

export function startOfMonth(key) {
  return key.slice(0, 8) + '01';
}

export function endOfMonth(key) {
  const d = parseKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function monthKey(key) {
  return key.slice(0, 7);
}

/** Inclusive list of keys from..to */
export function rangeKeys(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** The Sunday-first grid of whole weeks covering the month of `key`. */
export function monthGrid(key) {
  const start = startOfWeek(startOfMonth(key));
  const end = addDays(startOfWeek(endOfMonth(key)), 6);
  return rangeKeys(start, end);
}

export function weekKeys(key) {
  const s = startOfWeek(key);
  return rangeKeys(s, addDays(s, 6));
}

// ---------- Hebrew formatting (Israeli locale) ----------
const LOCALE = 'he-IL';
/** @param {Intl.DateTimeFormatOptions} o */
const fmt = (o) => new Intl.DateTimeFormat(LOCALE, o);
const F = {
  weekday: fmt({ weekday: 'long' }),
  dayMonth: fmt({ day: 'numeric', month: 'long' }),
  dayMonthYear: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  month: fmt({ month: 'long' }),
  numeric: fmt({ day: 'numeric', month: 'numeric' }),
};

export const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const formatWeekday = (k) => F.weekday.format(parseKey(k));
export const formatDayMonth = (k) => F.dayMonth.format(parseKey(k));
export const formatMonthYear = (k) => F.monthYear.format(parseKey(k));
export const formatNumeric = (k) => F.numeric.format(parseKey(k));
export function formatDayMonthMaybeYear(k, today = todayKey()) {
  return k.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(k) : F.dayMonthYear.format(parseKey(k));
}

/** "היום" / "מחר" / "אתמול" or null */
export function relativeLabel(k, today = todayKey()) {
  const diff = dayDiff(today, k);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return null;
}

/** Short label for chips: "היום", "מחר", "יום ה׳, 27.11" */
export function shortDateLabel(k, today = todayKey()) {
  const rel = relativeLabel(k, today);
  if (rel) return rel;
  const diff = dayDiff(today, k);
  if (diff > 1 && diff < 7) return `יום ${DAY_NAMES[weekday(k)]}`;
  return `${DAY_LETTERS[weekday(k)]} ${formatNumeric(k)}`;
}

/** "22–28 בנובמבר" / "29 בנובמבר – 5 בדצמבר" */
export function formatWeekRange(startKey) {
  const endKey = addDays(startKey, 6);
  const s = parseKey(startKey), e = parseKey(endKey);
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ב${F.month.format(e)}`;
  return `${formatDayMonth(startKey)} – ${formatDayMonth(endKey)}`;
}

/** "08:30:00" -> "08:30" */
export function formatTime(t) {
  return t ? t.slice(0, 5) : '';
}
