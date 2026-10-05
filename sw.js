// Service worker: zorgt dat de app ook zonder internet opent.
// Strategie: eerst het netwerk proberen (zodat je altijd de nieuwste versie krijgt),
// en bij geen of trage verbinding de opgeslagen kopie gebruiken.

const CACHE = 'macro-tracker-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/util.js',
  'js/ui.js',
  'js/icons.js',
  'js/store.js',
  'js/food.js',
  'js/off.js',
  'js/nevo.js',
  'js/scanner.js',
  'js/chart.js',
  'js/views/today.js',
  'js/views/library.js',
  'js/views/weight.js',
  'js/views/settings.js',
  'vendor/barcode-detector/ponyfill.js',
  'vendor/barcode-detector/zxing_reader.wasm',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Alleen eigen bestanden; Open Food Facts gaat altijd rechtstreeks naar internet.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // De scanner-bibliotheek verandert niet: eerst uit de cache.
  if (url.pathname.includes('/vendor/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('index.html');
        throw new Error('offline');
      }
    })(),
  );
});
