// The six flexible parts of the day.
export const PERIODS = /** @type {const} */ ([
  { id: 'morning', label: 'בוקר', hint: '05–09', icon: 'sunrise', from: 5 },
  { id: 'late_morning', label: 'לפני הצהריים', hint: '09–12', icon: 'sun', from: 9 },
  { id: 'noon', label: 'צהריים', hint: '12–14', icon: 'sunHigh', from: 12 },
  { id: 'afternoon', label: 'אחר הצהריים', hint: '14–18', icon: 'sunLow', from: 14 },
  { id: 'evening', label: 'ערב', hint: '18–21', icon: 'sunset', from: 18 },
  { id: 'night', label: 'לילה', hint: '21–05', icon: 'moon', from: 21 },
]);

export const PERIOD_IDS = PERIODS.map((p) => p.id);

/** @param {string} id */
export function periodById(id) {
  return PERIODS.find((p) => p.id === id) || null;
}

/** Period that contains an hour (0–23). */
export function periodForHour(h) {
  if (h < 5 || h >= 21) return 'night';
  if (h < 9) return 'morning';
  if (h < 12) return 'late_morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** @param {string} t "HH:MM[:SS]" */
export function periodForTime(t) {
  return periodForHour(Number(t.slice(0, 2)));
}

export function currentPeriod(now = new Date()) {
  return periodForHour(now.getHours());
}

/** A sensible default period for a new item on a given day. */
export function defaultPeriodFor(dateKey, today, now = new Date()) {
  return dateKey === today ? currentPeriod(now) : 'morning';
}
