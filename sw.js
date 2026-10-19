// Service worker: lets the app open and work with no Wi-Fi.
// Strategy: serve from cache immediately, refresh the cache in the background.
// Bump VERSION whenever files are published so every device picks up the new version.

const VERSION = 'ilp-carton-v1.2.0';

const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/css/app.css', 'assets/css/fonts.css',
  'assets/img/logo.png', 'assets/img/logo-mark.png', 'assets/img/favicon.png', 'assets/img/icon-192.png',
  'assets/fonts/Montserrat-normal-latin.woff2', 'assets/fonts/Montserrat-normal-latin-ext.woff2', 'assets/fonts/Montserrat-normal-vietnamese.woff2',
  'assets/fonts/SourceSerif4-normal-latin.woff2', 'assets/fonts/SourceSerif4-normal-latin-ext.woff2', 'assets/fonts/SourceSerif4-normal-vietnamese.woff2',
  'vendor/preact-htm.js', 'vendor/qrcode-generator.js', 'vendor/qr-scanner.min.js', 'vendor/qr-scanner-worker.min.js',
  'vendor/firebase-app.js', 'vendor/firebase-firestore.js', 'vendor/firebase-auth.js', 'vendor/xlsx.full.min.js',
  'src/main.js', 'src/config.js', 'src/util.js', 'src/i18n.js', 'src/qr.js', 'src/model.js', 'src/store.js',
  'src/components.js', 'src/print.js', 'src/excel.js', 'src/sample.js', 'src/db/local.js', 'src/db/firebase.js',
  'src/views/home.js', 'src/views/scan.js', 'src/views/scanner.js', 'src/views/carton.js', 'src/views/records.js',
  'src/views/record-view.js', 'src/views/record-form.js', 'src/views/items.js', 'src/views/settings.js', 'src/views/login.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Firebase traffic goes straight to the network
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
