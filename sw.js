// Service worker: cachea el "shell" de la app. Los datos (Supabase) siempre van a red.
const VERSION = 'edm-v4';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/auth.js', './js/router.js', './js/api.js',
  './js/store.js', './js/util.js', './js/ui.js', './js/isbn.js', './js/scanner.js', './js/theme.js',
  './js/views/library.js', './js/views/scan.js', './js/views/catalog.js', './js/views/book.js',
  './js/views/profile.js', './js/views/supporter.js',
  './assets/icons/icon.svg', './privacidad.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('buymeacoffee.com')) return; // datos: sin caché

  // Mismo origen: red primero (para recibir actualizaciones), caché si no hay conexión.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }

  // CDN (librerías versionadas, fuentes): caché primero.
  if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
