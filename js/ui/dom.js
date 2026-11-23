/**
 * Tiny DOM builder.
 * h('button', { class: 'btn', onClick: fn, 'aria-label': 'x' }, 'text', child)
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

/** @param {Node} el @param {any[]} children */
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Left-to-right isolated run inside Hebrew text (times, numbers ranges). */
export const ltr = (text) => h('bdi', { dir: 'ltr' }, text);

/** Light haptic tick where supported (Android). iOS ignores it silently. */
export function haptic() {
  try { navigator.vibrate && navigator.vibrate(8); } catch { /* ignore */ }
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
