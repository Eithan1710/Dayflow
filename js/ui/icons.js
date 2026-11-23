// Stroke icon set (24×24, currentColor), drawn for Dayflow.
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tasks: '<rect x="3.5" y="4.5" width="6" height="6" rx="1.8"/><rect x="3.5" y="13.5" width="6" height="6" rx="1.8"/><path d="M13 7.5h7.5M13 16.5h7.5M5 16.6l1.3 1.3 2-2.4"/>',
  settings: '<path d="M4 7h9M17.5 7H20M4 17h3M11.5 17H20"/><circle cx="15.2" cy="7" r="2.3"/><circle cx="9.2" cy="17" r="2.3"/>',
  sunrise: '<path d="M3 19h18M6.5 19a5.5 5.5 0 0 1 11 0M12 3.5v4M9.5 6l2.5-2.5L14.5 6M4.2 12.2l1.6 1M19.8 12.2l-1.6 1"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
  sunHigh: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  sunLow: '<path d="M3 19.5h18"/><circle cx="12" cy="13" r="3.4"/><path d="M12 6.2V5M6.6 8.4l-.9-.9M17.4 8.4l.9-.9M4.8 13.2H3.6M20.4 13.2h-1.2"/>',
  sunset: '<path d="M3 19h18M6.5 19a5.5 5.5 0 0 1 11 0M12 8V4M9.5 5.5L12 8l2.5-2.5M4.2 12.2l1.6 1M19.8 12.2l-1.6 1"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  repeat: '<path d="M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12.2a1.8 1.8 0 0 0 1.8 1.6h5.8a1.8 1.8 0 0 0 1.8-1.6L17.5 7M9.5 7V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3V7"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  arrowLeft: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/>',
  note: '<path d="M5 6.5h14M5 12h14M5 17.5h9"/>',
  logout: '<path d="M14.5 4h3A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-3M10 16.5L5.5 12 10 7.5M5.5 12h10"/>',
  share: '<path d="M12 3.5v12M8 7.5l4-4 4 4M5.5 12v6.5A2 2 0 0 0 7.5 20.5h9a2 2 0 0 0 2-2V12"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6h2A3.9 3.9 0 0 0 20.5 11 8 8 0 0 0 12 3.5z"/><circle cx="7.8" cy="11.5" r="1"/><circle cx="10.5" cy="7.6" r="1"/><circle cx="15" cy="8" r="1"/>',
  sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/>',
  allDay: '<rect x="3.5" y="7" width="17" height="10" rx="5"/><path d="M8 12h8"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.2-2.4M19 13a10 10 0 0 0-3-2M2 9.3a15 15 0 0 1 4.3-2.8M22 9.3A15 15 0 0 0 11 5.1"/><circle cx="12" cy="20" r=".6"/>',
};

/**
 * @param {keyof typeof P | string} name
 * @param {number} [size]
 */
export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}
