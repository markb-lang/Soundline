/* Soundline — service worker
 * Bump CACHE on EVERY deploy so returning users fetch the new build.
 * (Changing this file at all also triggers the browser to install the new
 *  worker; the version string is what purges the old caches on activate.)
 */
const CACHE = 'soundline-v18';

/* Local app shell + the static assets index.html actually references. */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/apple-touch-icon.png'
];

/* Live-data hosts: always go to the network, never cache.
 * Weather, water levels, and geocoding must be fresh. */
const LIVE_HOSTS = [
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'photon.komoot.io',
  'waterservices.usgs.gov',   // legacy NWIS (migration planned 2026)
  'api.waterdata.usgs.gov'    // future OGC endpoint
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Add items individually: one missing file won't fail the whole install.
      return Promise.allSettled(PRECACHE.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) { return caches.delete(k); }
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);

  // 1) Page navigations -> network-first, fall back to cached shell when offline.
  //    This is what makes a new deploy actually reach people.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('/', copy); });
        return res;
      }).catch(function () {
        return caches.match('/').then(function (r) { return r || caches.match('/index.html'); });
      })
    );
    return;
  }

  // 2) Live data APIs -> network only, no caching.
  if (LIVE_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(fetch(req).catch(function () { return new Response('', { status: 504 }); }));
    return;
  }

  // 3) Map tiles -> network; don't pack the cache with thousands of tiles.
  if (url.hostname.indexOf('tile.openstreetmap.org') !== -1) {
    e.respondWith(fetch(req).catch(function () { return caches.match(req); }));
    return;
  }

  // 4) Everything else (own static assets + stable CDN libs/fonts):
  //    cache-first, then network, caching good responses for next time.
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
