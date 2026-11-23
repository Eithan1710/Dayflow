// Reusable form controls for the sheets.
import { addDays, formatDayMonthMaybeYear, relativeLabel, todayKey } from '../lib/dates.js';
import { COLORS } from '../data/schema.js';
import { h, haptic } from './dom.js';
import { icon } from './icons.js';

/**
 * Single-select chip row (radio semantics).
 * @param {{ label?: string, options: {value: any, label: string, icon?: string, color?: string}[],
 *           value: any, onChange: (v: any) => void, allowNone?: boolean, scroll?: boolean, compact?: boolean }} o
 */
export function chips(o) {
  let value = o.value;
  const buttons = o.options.map((opt) => {
    const b = h('button', {
      type: 'button', role: 'radio', class: 'chip' + (opt.color ? ' has-dot' : ''),
      dataset: opt.color ? { color: opt.color } : undefined,
      onClick: () => {
        const next = o.allowNone && value === opt.value ? null : opt.value;
        set(next);
        haptic();
        o.onChange(next);
      },
    },
    opt.icon ? icon(opt.icon, 18) : null,
    opt.color ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null,
    h('span', null, opt.label));
    return /** @type {[any, HTMLElement]} */ ([opt.value, b]);
  });
  const el = h('div', {
    class: 'chips' + (o.scroll ? ' chips-scroll' : '') + (o.compact ? ' chips-compact' : ''),
    role: 'radiogroup', 'aria-label': o.label || null,
  }, buttons.map(([, b]) => b));
  function set(v) {
    value = v;
    for (const [val, b] of buttons) {
      const on = val === v;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
  set(value);
  return { el, set, get: () => value };
}

/**
 * Date picker: quick chips + native date input for anything else.
 * @param {{ value: string|null, onChange: (v: string|null) => void, allowNone?: boolean, noneLabel?: string,
 *           label: string, min?: string }} o
 */
export function dateField(o) {
  let value = o.value;
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'date', class: 'date-overlay', 'aria-label': o.label, value: value || '', min: o.min || null,
    onChange: () => { if (input.value) commit(input.value); },
  }));
  const otherLabel = h('span');
  const mk = (label, v) => h('button', { type: 'button', class: 'chip', onClick: () => commit(v) }, label);
  const none = o.allowNone ? mk(o.noneLabel || 'ללא', null) : null;
  const todayB = mk('היום', today);
  const tomB = mk('מחר', tomorrow);
  const other = h('label', { class: 'chip chip-date' }, icon('calendar', 17), otherLabel, input);
  const el = h('div', { class: 'chips', role: 'group', 'aria-label': o.label }, none, todayB, tomB, other);
  function commit(v) {
    value = v;
    paint();
    haptic();
    o.onChange(v);
  }
  function paint() {
    none && none.classList.toggle('is-on', value === null);
    todayB.classList.toggle('is-on', value === today);
    tomB.classList.toggle('is-on', value === tomorrow);
    const isOther = !!value && value !== today && value !== tomorrow;
    other.classList.toggle('is-on', isOther);
    otherLabel.textContent = isOther ? (relativeLabel(value) || formatDayMonthMaybeYear(value)) : 'תאריך אחר';
    input.value = value || '';
  }
  paint();
  return { el, get: () => value, set: (v) => { value = v; paint(); } };
}

/** @param {{ value: string|null, onChange: (v: string|null) => void, label: string }} o */
export function timeInput(o) {
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'time', class: 'input input-time', value: o.value || '', 'aria-label': o.label, step: 300,
    onChange: () => o.onChange(input.value || null),
  }));
  return input;
}

/** Category chips. */
export function categoryChips(categories, value, onChange) {
  return chips({
    label: 'קטגוריה', scroll: true, allowNone: true, value,
    options: categories.map((c) => ({ value: c.id, label: c.name, color: c.color })),
    onChange,
  });
}

export const PRIORITY_OPTIONS = [
  { value: 1, label: 'נמוכה' },
  { value: 2, label: 'בינונית' },
  { value: 3, label: 'גבוהה' },
];

export const COLOR_NAMES = {
  slate: 'אפור', blue: 'כחול', indigo: 'אינדיגו', violet: 'סגול', rose: 'ורוד',
  orange: 'כתום', amber: 'צהוב', green: 'ירוק', teal: 'טורקיז',
};

/** Color swatches. @param {{ value: string|null, onChange: (v: string|null) => void, allowNone?: boolean }} o */
export function colorSwatches(o) {
  let value = o.value;
  const items = COLORS.map((c) => {
    const b = h('button', {
      type: 'button', role: 'radio', class: 'swatch', dataset: { color: c }, 'aria-label': COLOR_NAMES[c],
      onClick: () => { value = o.allowNone && value === c ? null : c; paint(); haptic(); o.onChange(value); },
    }, icon('check', 16));
    return /** @type {[string, HTMLElement]} */ ([c, b]);
  });
  const el = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'צבע' }, items.map(([, b]) => b));
  function paint() {
    for (const [c, b] of items) {
      b.classList.toggle('is-on', c === value);
      b.setAttribute('aria-checked', String(c === value));
    }
  }
  paint();
  return { el };
}

/** Labeled form row. */
export function field(label, control, opts = {}) {
  return h('div', { class: 'field' + (opts.class ? ' ' + opts.class : '') },
    h('div', { class: 'field-label' }, opts.icon ? icon(opts.icon, 17) : null, h('span', null, label)),
    control);
}

/** Collapsible "more options" area. */
export function disclosure(label, content, open = false) {
  const body = h('div', { class: 'disclosure-body' }, content);
  const btn = h('button', {
    type: 'button', class: 'disclosure-btn', 'aria-expanded': String(open),
    onClick: () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      body.hidden = isOpen;
    },
  }, h('span', null, label), icon('chevronDown', 18));
  body.hidden = !open;
  return h('div', { class: 'disclosure' }, btn, body);
}
