// Cache the shell so the church opens instantly and works offline.
// Bump CACHE on every deploy or players keep the old build.
const CACHE = 'etl-v3';
const SHELL = [
  './', './index.html', './manifest.json',
  './src/main.js',
  './src/core/state.js', './src/core/time.js', './src/core/offline.js',
  './src/core/save.js', './src/core/rng.js', './src/core/grid.js',
  './src/core/modifiers.js', './src/core/sanctuary.js', './src/core/prayer.js',
  './src/core/casting.js',
  './src/sim/pathfinding.js', './src/sim/visitors.js',
  './src/core/serve.js',
  './src/render/scene.js', './src/render/camera.js', './src/render/church.js',
  './src/render/layout.js', './src/render/palette.js',
  './src/render/characters.js', './src/render/bubble.js',
  './src/render/crowd.js', './src/render/picking.js',
  './src/data/tuning.js', './src/data/needs.js', './src/data/rooms.js',
  './src/data/ministries.js', './src/data/schedule.js', './src/data/casting.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
