// Detección de versiones nuevas. Imprescindible en la app instalada (sobre todo en iOS),
// que no tiene botón de recargar y se reanuda en lugar de reiniciarse.
import { APP_VERSION } from './version.js';

const CHECK_EVERY_MS = 30 * 60 * 1000;
let lastCheck = 0;
let bannerShown = false;

/** Lee APP_VERSION publicada en el servidor (sin caché). */
async function publishedVersion() {
  const res = await fetch(`js/version.js?check=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.text()).match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] ?? null;
}

export function reloadApp() {
  // El service worker va a red primero para los ficheros propios: una recarga trae la versión nueva
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
  location.reload();
}

function showBanner(version) {
  if (bannerShown) return;
  bannerShown = true;
  const bar = document.createElement('div');
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>Hay una versión nueva${version ? ` (v${version})` : ''}.</span>
    <button class="btn btn-sm btn-primary" type="button">Actualizar</button>
    <button class="update-close" type="button" aria-label="Más tarde">×</button>`;
  bar.querySelector('.btn').onclick = reloadApp;
  bar.querySelector('.update-close').onclick = () => bar.remove();
  document.body.append(bar);
}

/** Comprueba si hay versión nueva. Devuelve la versión publicada o null si ya es la última. */
export async function checkForUpdate({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastCheck < CHECK_EVERY_MS) return null;
  lastCheck = now;
  try {
    const v = await publishedVersion();
    if (v && v !== APP_VERSION) { showBanner(v); return v; }
  } catch { /* sin conexión */ }
  return null;
}

/** Revisa al abrir, al volver a la app (iOS la reanuda) y cada 30 min. */
export function watchForUpdates() {
  setTimeout(() => checkForUpdate({ force: true }), 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  setInterval(() => checkForUpdate(), CHECK_EVERY_MS);
}
