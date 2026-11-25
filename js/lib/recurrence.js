import { DAY_LETTERS, DAY_NAMES, dayDiff, parseKey, startOfWeek, weekday } from './dates.js';

/**
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} title
 * @property {string} start_date
 * @property {string|null} [end_date]
 * @property {string|null} [period]
 * @property {boolean} [all_day]
 * @property {string|null} [start_time]
 * @property {string|null} [end_time]
 * @property {string|null} [category_id]
 * @property {string|null} [color]
 * @property {string|null} [location]
 * @property {number|null} [priority]
 * @property {string|null} [description]
 * @property {boolean} [completed]
 * @property {string|null} [completed_at]
 * @property {string|null} [repeat_freq]
 * @property {number} [repeat_interval]
 * @property {number[]|null} [repeat_weekdays]
 * @property {string|null} [repeat_until]
 * @property {number|null} [period_order]  manual position inside its part of the day
 * @property {string} [created_at]
 */

export const REPEAT_OPTIONS = [
  { id: '', label: 'ללא', formLabel: 'לא חוזר' },
  { id: 'daily', label: 'כל יום' },
  { id: 'weekly', label: 'כל שבוע', formLabel: 'ימים בשבוע' },
  { id: 'monthly', label: 'כל חודש' },
  { id: 'yearly', label: 'כל שנה' },
];

/** Does the activity take place on date `k`? @param {Activity} a @param {string} k */
export function occursOn(a, k) {
  if (!a.repeat_freq) return k >= a.start_date && k <= (a.end_date || a.start_date);
  if (k < a.start_date) return false;
  if (a.repeat_until && k > a.repeat_until) return false;
  const every = Math.max(1, a.repeat_interval || 1);
  switch (a.repeat_freq) {
    case 'daily':
      return dayDiff(a.start_date, k) % every === 0;
    case 'weekly': {
      const days = a.repeat_weekdays && a.repeat_weekdays.length ? a.repeat_weekdays : [weekday(a.start_date)];
      if (!days.includes(weekday(k))) return false;
      const weeks = dayDiff(startOfWeek(a.start_date), startOfWeek(k)) / 7;
      return weeks % every === 0;
    }
    case 'monthly': {
      const s = parseKey(a.start_date), d = parseKey(k);
      if (d.getDate() !== s.getDate()) return false; // months without that day are skipped
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      return months % every === 0;
    }
    case 'yearly': {
      const s = parseKey(a.start_date), d = parseKey(k);
      if (d.getDate() !== s.getDate() || d.getMonth() !== s.getMonth()) return false;
      return (d.getFullYear() - s.getFullYear()) % every === 0;
    }
    default:
      return false;
  }
}

/** True when the activity spans several days (and is not recurring). */
export function isMultiDay(a) {
  return !a.repeat_freq && !!a.end_date && a.end_date > a.start_date;
}

/** Human description of a repeat rule, in Hebrew. */
export function describeRepeat(a) {
  if (!a.repeat_freq) return '';
  const n = a.repeat_interval || 1;
  if (a.repeat_freq === 'weekly') {
    const days = [...(a.repeat_weekdays && a.repeat_weekdays.length ? a.repeat_weekdays : [weekday(a.start_date)])].sort();
    const every = n === 1 ? '' : n === 2 ? 'כל שבועיים, ' : `כל ${n} שבועות, `;
    if (days.length === 7) return n === 1 ? 'כל יום' : every + 'כל הימים';
    if (days.length === 1) return n === 1 ? `כל יום ${DAY_NAMES[days[0]]}` : every + `יום ${DAY_NAMES[days[0]]}`;
    return every + 'בימים ' + days.map((d) => DAY_LETTERS[d]).join(' ');
  }
  const base = {
    daily: n === 1 ? 'כל יום' : `כל ${n} ימים`,
    weekly: n === 1 ? 'כל שבוע' : n === 2 ? 'כל שבועיים' : `כל ${n} שבועות`,
    monthly: n === 1 ? 'כל חודש' : n === 2 ? 'כל חודשיים' : `כל ${n} חודשים`,
    yearly: n === 1 ? 'כל שנה' : n === 2 ? 'כל שנתיים' : `כל ${n} שנים`,
  }[a.repeat_freq] || '';
  return base;
}
