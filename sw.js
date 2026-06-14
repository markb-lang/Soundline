/* Soundline service worker — makes the app open offline.
   If you change files later, bump CACHE (v1 -> v2) to force an update. */
const CACHE = 'soundline-v12';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/maskable-512.png', '/apple-touch-icon.png'
];

// Live data that should always come fresh from the network (never served stale).
const LIVE = [
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'basemap.nationalmap.gov',
  'tile.openstreetmap.org',
  'waterservices.usgs.gov'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Opening the app: try network, fall back to the cached page so it loads offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Live data hosts: let them hit the network normally (they fail gracefully offline).
  if (LIVE.some((h) => url.hostname.includes(h))) return;

  // Everything else (fonts, Leaflet, our icons/assets): serve from cache, then update it.
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
