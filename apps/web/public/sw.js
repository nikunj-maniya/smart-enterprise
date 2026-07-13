// PWA baseline (reporting-and-polish): a basic offline shell. Runtime-caches same-origin GETs as
// they're visited (no build-time precache manifest — Vite's hashed asset names make that a
// heavier lift than a "basic offline shell" warrants) so previously loaded views still render
// without a connection; API calls (a different origin) are never intercepted here.
const CACHE_NAME = 'se-shell-v1';
const SHELL_URLS = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached ?? caches.match('/'))),
  );
});
