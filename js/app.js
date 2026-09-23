import { isConfigured } from './supabase.js';
import { getSession, onAuthChange, signInWithGoogle } from './auth.js';
import { state, loadAll, isSupporter } from './store.js';
import { route, start, resolve } from './router.js';
import { html, $, $$, toast } from './util.js';
import { restoreTheme } from './theme.js';
import { renderLibrary } from './views/library.js';
import { renderScan } from './views/scan.js';
import { renderCatalog } from './views/catalog.js';
import { renderBook } from './views/book.js';
import { renderProfile } from './views/profile.js';
import { renderSupporter } from './views/supporter.js';

const view = $('#view');
const nav = $('#nav');

function setActiveNav() {
  const path = location.hash.slice(1) || '/biblioteca';
  $$('#nav a').forEach((a) => a.classList.toggle('active', path.startsWith(a.getAttribute('href').slice(1))));
}

function renderLanding() {
  document.body.classList.add('landing');
  nav.hidden = true;
  view.innerHTML = html`
    <section class="hero">
      <img src="assets/icons/icon.svg" alt="" class="hero-logo" width="96" height="96">
      <h1>Escriba de la Marca</h1>
      <p class="lead">Tu biblioteca de <em>Aventuras en la Marca del Este</em>, siempre en el bolsillo.</p>
      <ul class="hero-points">
        <li>📚 Tu colección ordenada por categorías</li>
        <li>📷 Escanea el código de barras y sabrás al instante si ya lo tienes</li>
        <li>☁️ Sincronizada entre tus dispositivos</li>
      </ul>
      <button class="btn btn-google" data-login>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Entrar con Google
      </button>
      <p class="muted small">Proyecto de fans, no oficial · <a href="privacidad.html">Privacidad</a></p>
    </section>`;
  $('[data-login]', view).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await signInWithGoogle(); } catch (err) { toast(err.message, 'error'); e.currentTarget.disabled = false; }
  };
}

function renderSetup() {
  nav.hidden = true;
  view.innerHTML = html`<section class="hero"><h1>Falta configuración</h1>
    <p>Rellena <code>js/config.js</code> con la URL y la anon key de tu proyecto Supabase. Consulta el README.</p></section>`;
}

let routerStarted = false;
let currentUid = null;

async function enterApp(session) {
  state.session = session;
  document.body.classList.remove('landing');
  view.innerHTML = '<div class="loading" aria-busy="true">Abriendo el grimorio…</div>';
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    view.innerHTML = html`<div class="empty"><h2>No se pudieron cargar los datos</h2><p class="muted">${e.message}</p>
      <button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  restoreTheme(isSupporter());
  nav.hidden = false;
  if (!routerStarted) {
    routerStarted = true;
    window.addEventListener('hashchange', setActiveNav);
    await start();
  } else {
    await resolve();
  }
  setActiveNav();
}

// Cada vista recibe el contenedor; puede devolver { cleanup }.
const mount = (fn) => async (params) => {
  if (!state.session) return null;
  window.scrollTo(0, 0);
  return fn(view, params);
};
route('/biblioteca', mount(renderLibrary));
route('/escanear', mount(renderScan));
route('/catalogo', mount(renderCatalog));
route('/libro/:id', mount(renderBook));
route('/perfil', mount(renderProfile));
route('/mecenas', mount(renderSupporter));

async function boot() {
  restoreTheme(false);
  if (!isConfigured) return renderSetup();

  const session = await getSession();
  currentUid = session?.user?.id ?? null;
  if (session) await enterApp(session); else renderLanding();

  onAuthChange(async (s) => {
    const uid = s?.user?.id ?? null;
    if (s) state.session = s; // refresco de token
    if (uid === currentUid) return;
    currentUid = uid;
    if (s) await enterApp(s);
    else { state.session = null; location.hash = ''; renderLanding(); }
  });
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
