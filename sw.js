// Service worker: cachea el "shell" de la app. Los datos (Supabase) siempre van a red.
// En producción, .github/workflows/pages.yml sustituye VERSION por el hash del commit.
const VERSION = 'edm-dev';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/fonts.css', './css/tokens.css', './css/base.css', './css/layout.css',
  './css/components.css', './css/views.css', './css/themes.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/auth.js', './js/router.js', './js/api.js',
  './js/store.js', './js/util.js', './js/ui.js', './js/isbn.js', './js/scanner.js', './js/theme.js',
  './js/views/library.js', './js/views/scan.js', './js/views/catalog.js', './js/views/book.js',
  './js/views/profile.js', './js/views/supporter.js', './js/views/review.js', './js/nav.js', './js/version.js', './js/views/finder.js', './js/views/wishlist-public.js', './js/views/admin.js', './js/track.js', './js/update.js', './js/navlist.js', './js/icons.js', './js/export.js', './js/settings.js', './js/announcement.js', './js/achievements.js', './js/library-actions.js', './js/views/help.js', './js/views/scribes.js',
  './assets/icons/icon.svg', './assets/icons/seal.svg', './privacidad.html',
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
  if (url.searchParams.has('check')) return; // comprobación de versión nueva: siempre a red, sin guardar

  // Mismo origen: red primero (para recibir actualizaciones), caché si no hay conexión.
  if (url.origin === location.origin) {
    // cache: 'no-cache' → siempre revalida con el servidor (ETag). Evita mezclar módulos JS de versiones distintas
    // durante los 10 minutos que GitHub Pages deja en la caché HTTP del navegador tras publicar.
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }

  // CDN (librerías versionadas, fuentes): caché primero.
  if (/cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
