import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, dayDiff, formatDayMonth, formatWeekRange, monthGrid, relativeLabel, shortDateLabel,
  startOfWeek, weekKeys, weekday,
} from '../js/lib/dates.js';
import { periodForTime, defaultPeriodFor } from '../js/lib/periods.js';
import { describeRepeat, occursOn } from '../js/lib/recurrence.js';
import { usernameToEmail } from '../js/data/schema.js';

test('date arithmetic stays on local calendar days (incl. DST switch)', () => {
  assert.equal(addDays('2026-03-26', 1), '2026-03-27'); // Israel DST starts late March
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dayDiff('2026-11-23', '2026-12-01'), 8);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
});

test('weeks start on Sunday', () => {
  assert.equal(weekday('2026-11-22'), 0); // Sunday
  assert.equal(startOfWeek('2026-11-23'), '2026-11-22');
  assert.equal(startOfWeek('2026-11-28'), '2026-11-22'); // Saturday belongs to the same week
  assert.deepEqual(weekKeys('2026-11-23')[6], '2026-11-28');
});

test('month grid covers whole weeks from Sunday', () => {
  const g = monthGrid('2026-11-23');
  assert.equal(g[0], '2026-11-01'); // Nov 1 2026 is a Sunday
  assert.equal(g.length % 7, 0);
  assert.equal(g[g.length - 1], '2026-12-05');
});

test('Hebrew formatting', () => {
  assert.equal(formatDayMonth('2026-11-23'), '23 בנובמבר');
  assert.equal(formatWeekRange('2026-11-22'), '22–28 בנובמבר');
  assert.equal(formatWeekRange('2026-11-29'), '29 בנובמבר – 5 בדצמבר');
  assert.equal(relativeLabel('2026-11-24', '2026-11-23'), 'מחר');
  assert.equal(relativeLabel('2026-11-22', '2026-11-23'), 'אתמול');
  assert.equal(shortDateLabel('2026-11-26', '2026-11-23'), 'יום חמישי');
});

test('periods from times', () => {
  assert.equal(periodForTime('06:30'), 'morning');
  assert.equal(periodForTime('10:00'), 'late_morning');
  assert.equal(periodForTime('12:15'), 'noon');
  assert.equal(periodForTime('15:00'), 'afternoon');
  assert.equal(periodForTime('19:30'), 'evening');
  assert.equal(periodForTime('23:00'), 'night');
  assert.equal(periodForTime('02:00'), 'night');
  assert.equal(defaultPeriodFor('2026-11-24', '2026-11-23'), 'morning');
});

const base = { id: 'a', title: 't', start_date: '2026-11-02', period: 'morning' };

test('single and multi-day activities', () => {
  assert.ok(occursOn(base, '2026-11-02'));
  assert.ok(!occursOn(base, '2026-11-03'));
  const trip = { ...base, end_date: '2026-11-05' };
  assert.ok(occursOn(trip, '2026-11-04'));
  assert.ok(!occursOn(trip, '2026-11-06'));
});

test('daily / weekly / monthly / yearly recurrence', () => {
  const daily = { ...base, repeat_freq: 'daily', repeat_interval: 2, repeat_until: '2026-11-10' };
  assert.ok(occursOn(daily, '2026-11-04'));
  assert.ok(!occursOn(daily, '2026-11-05'));
  assert.ok(!occursOn(daily, '2026-11-12'));
  assert.ok(!occursOn(daily, '2026-11-01'));

  // Monday & Wednesday, every week (Nov 2 2026 is a Monday)
  const weekly = { ...base, repeat_freq: 'weekly', repeat_weekdays: [1, 3] };
  assert.ok(occursOn(weekly, '2026-11-04'));
  assert.ok(occursOn(weekly, '2026-11-09'));
  assert.ok(!occursOn(weekly, '2026-11-05'));
  const biweekly = { ...base, repeat_freq: 'weekly', repeat_interval: 2, repeat_weekdays: null };
  assert.ok(occursOn(biweekly, '2026-11-16'));
  assert.ok(!occursOn(biweekly, '2026-11-09'));

  const monthly = { ...base, start_date: '2026-01-31', repeat_freq: 'monthly' };
  assert.ok(occursOn(monthly, '2026-03-31'));
  assert.ok(!occursOn(monthly, '2026-02-28')); // months without the 31st are skipped

  const yearly = { ...base, start_date: '2024-02-29', repeat_freq: 'yearly' };
  assert.ok(occursOn(yearly, '2028-02-29'));
  assert.ok(!occursOn(yearly, '2026-02-28'));
  assert.equal(describeRepeat(biweekly), 'כל שבועיים');
});

test('username maps to the same e-mail the database account was created with', () => {
  assert.equal(usernameToEmail(' איתן ', 'users.dayflow.local'), 'u-d790d799d7aad79f@users.dayflow.local');
  assert.equal(usernameToEmail('Demo', 'x.local'), usernameToEmail('demo', 'x.local'));
});
