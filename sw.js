// Queuey service worker — network-first.
// Always tries the network so updates appear right away; falls back to the
// cache when offline. No manual version bump is needed for normal updates.
const CACHE = 'swordstv-cache';
const ASSETS = [
  './',
  './index.html',
  './queuey.svg',
  './fonts/fredoka-700.woff2',
  './styles.css',
  './taste.js',
  './sync.js',
  './search.js',
  './app-config.json',
  './guidance.json',
  './setup.js',
  './release.json',
  './firebase-config.json',
  './discoveries.json',
  './app.js',
  './data.json',
  './shows.json',
  './tmdb.json',
  './scores.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMAGES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Show artwork never changes at a given address, so it is served from the
// cache first and only fetched once (works offline after the first view).
const IMAGES = 'swordstv-images';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'image.tmdb.org') {
    e.respondWith(caches.open(IMAGES).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    // 'no-cache' revalidates with the server instead of reusing GitHub Pages'
    // 10-minute HTTP cache, so a fresh deploy is picked up immediately.
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(cached =>
          cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
