// ============================================================
// sw.js — offline shell.
//
// STRATEGY MATTERS HERE. An earlier version was cache-first for
// everything, which meant a redeployed file kept serving the OLD
// copy until the worker happened to update — code changes looked
// like they simply hadn't happened.
//
//   Same-origin app code  → NETWORK FIRST, cache as fallback.
//     Always current when online, still works on a plane.
//   Cross-origin (Three.js CDN) → CACHE FIRST.
//     Version-pinned and immutable, so staleness is impossible.
//
// Bump BUILD on every deploy.
// ============================================================

const BUILD = 'v31-2026-08-24';
const CACHE = `etl-${BUILD}`;

const SHELL = [
  './', './index.html', './manifest.json',
  './src/main.js',
  './src/core/state.js', './src/core/time.js', './src/core/offline.js',
  './src/core/save.js', './src/core/rng.js', './src/core/grid.js',
  './src/core/modifiers.js', './src/core/sanctuary.js', './src/core/prayer.js',
  './src/core/casting.js', './src/core/serve.js',
  './src/core/production.js', './src/core/build.js', './src/core/service.js',
  './src/core/progression.js', './src/core/ministry.js', './src/core/rhythm.js', './src/core/away.js', './src/core/characters.js', './src/core/pastor.js',
  './src/sim/pathfinding.js', './src/sim/visitors.js',
  './src/render/scene.js', './src/render/camera.js', './src/render/church.js',
  './src/render/layout.js', './src/render/palette.js',
  './src/render/characters.js', './src/render/bubble.js',
  './src/render/crowd.js', './src/render/picking.js',
  './src/render/placement.js', './src/render/sites.js', './src/render/pastor.js',
  './src/render/interiors.js', './src/render/shapes.js',
  './src/render/models.js', './src/data/models.js',
  './src/data/tuning.js', './src/data/needs.js', './src/data/rooms.js',
  './src/data/ministries.js', './src/data/schedule.js', './src/data/casting.js',
  './src/data/controls.js', './src/data/sermons.js', './src/data/ranks.js', './src/data/characters.js',
  './src/data/furniture.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
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
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;

  if (sameOrigin) {
    // Network first: a redeploy is visible on the very next load.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cross-origin, version-pinned: cache first is safe.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});

// Lets the page ask which build is running.
self.addEventListener('message', (e) => {
  if (e.data === 'build') e.source?.postMessage({ build: BUILD });
});
