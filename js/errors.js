// Registro de errores de JavaScript en la tabla client_errors de Supabase (aviso por Telegram al admin).
// Se carga en index.html ANTES que app.js y sin supabase-js, para poder avisar también cuando la app
// no llega a arrancar (un módulo que no carga, el CDN caído…). Sin datos personales: mensaje, origen,
// pila recortada, pantalla, versión y navegador. Máximo 10 avisos por sesión y sin repetir.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { APP_VERSION } from './version.js';

const MAX_PER_SESSION = 10;
const BOOT_TIMEOUT_MS = 20000;
const sent = new Set();

// Ruido que no depende de la app: extensiones, widgets de terceros, red caída, avisos del navegador
const IGNORE_MESSAGE = /^Script error\.?$|ResizeObserver loop|Failed to fetch|Load failed|NetworkError|network error|AbortError|The operation was aborted/i;
const IGNORE_SOURCE = /^(chrome|moz|safari)(-web)?-extension:|buymeacoffee\.com/i;

const clip = (s, n) => (s == null || s === '' ? null : String(s).slice(0, n));
const short = (s) => (s ? String(s).split(location.origin).join('') : s);   // rutas relativas: más cortas

/** Token de la sesión guardada por supabase-js (si hay y no ha caducado), para asociar el error al usuario. */
function accessToken() {
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    const s = key ? JSON.parse(localStorage.getItem(key)) : null;
    return s?.access_token && s.expires_at * 1000 > Date.now() ? s.access_token : null;
  } catch { return null; }
}

/** Envía un error. kind: 'error' | 'rejection' | 'resource' | 'boot'. Nunca lanza. */
export function reportError(kind, message, { source = null, stack = null } = {}) {
  try {
    message = String(message ?? '').trim();
    if (!message || IGNORE_MESSAGE.test(message) || (source && IGNORE_SOURCE.test(source))) return;
    if (navigator.onLine === false || sent.size >= MAX_PER_SESSION) return;
    const key = `${kind}|${message}|${source}`;
    if (sent.has(key)) return;
    sent.add(key);

    const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    const jwt = accessToken();
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify({
        kind,
        message: clip(message, 500),
        source: clip(short(source), 300),
        stack: clip(short(stack), 2000),
        page: clip(location.hash.split('?')[0] || '#/', 100),
        app_version: APP_VERSION,
        user_agent: clip(navigator.userAgent, 300),
      }),
    }).catch(() => {});
  } catch { /* el registro de errores nunca debe romper nada */ }
}

// Errores no capturados
window.addEventListener('error', (e) => {
  const el = e.target;
  // Fallo al cargar un fichero (fase de captura: estos eventos no llegan por burbuja)
  if (el && el !== window && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) {
    const url = el.src || el.href;
    if (url && !IGNORE_SOURCE.test(url)) reportError('resource', `No se pudo cargar ${short(url)}`, { source: short(url) });
    return;
  }
  const source = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null;
  reportError('error', e.message || e.error?.message, { source, stack: e.error?.stack });
}, true);

// Promesas rechazadas sin gestionar
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  const message = r instanceof Error ? `${r.name}: ${r.message}` : r?.message || (typeof r === 'string' ? r : JSON.stringify(r ?? null));
  reportError('rejection', message, { stack: r?.stack });
});

// La app no arranca: sigue el «Cargando…» inicial pasado un buen rato (con la pestaña visible)
setTimeout(() => {
  if (document.visibilityState === 'visible' && document.querySelector('#view > .loading')) {
    reportError('boot', `La app no arrancó en ${BOOT_TIMEOUT_MS / 1000} s (${document.querySelector('#view > .loading').textContent.trim()})`);
  }
}, BOOT_TIMEOUT_MS);
