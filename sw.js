// Dayflow service worker: app shell + CDN library cached, API calls always live.
// Caches are prefixed "dayflow-" because other apps share this origin.
const VERSION = 'dayflow-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/lib/dates.js',
  './js/lib/periods.js',
  './js/lib/recurrence.js',
  './js/data/schema.js',
  './js/data/store.js',
  './js/data/backend-supabase.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/overlay.js',
  './js/ui/fields.js',
  './js/ui/forms.js',
  './js/ui/views.js',
  './js/ui/drag.js',
  './icons/mark.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dayflow-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co')) return; // never cache user data

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isCdn) return;
  if (sameOrigin && !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // CDN library: cache first (it is versioned and large).
  if (isCdn) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Own files: network first so a new deploy is never mixed with old modules;
  // the cache is the offline fallback.
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy));
      }
      return res;
    }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
  );
});
