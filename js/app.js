import { isConfigured } from './supabase.js';
import { getSession, onAuthChange, signInWithGoogle } from './auth.js';
import { state, loadAll, isSupporter } from './store.js';
import { route, start, resolve } from './router.js';
import { html, raw, $, $$, toast } from './util.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from './config.js';
import { restoreTheme } from './theme.js';
import { renderLibrary } from './views/library.js';
import { renderScan } from './views/scan.js';
import { renderCatalog } from './views/catalog.js';
import { renderBook } from './views/book.js';
import { renderProfile } from './views/profile.js';
import { renderSupporter } from './views/supporter.js';
import { renderReview } from './views/review.js';
import { renderFinder } from './views/finder.js';
import { renderPublicWishlist } from './views/wishlist-public.js';
import { renderAdmin } from './views/admin.js';
import { updateAdminBadge } from './nav.js';
import { showWhatsNewIfUpdated } from './ui.js';
import { trackOpen } from './track.js';

const view = $('#view');
const nav = $('#nav');

function setActiveNav() {
  const path = location.hash.slice(1) || '/biblioteca';
  const section = path.startsWith('/revision') ? '/admin' : path;
  $$('#nav a').forEach((a) => a.classList.toggle('active', section.startsWith(a.getAttribute('href').slice(1))));
  if (state.session) updateAdminBadge();
}

const GOOGLE_ICON = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function renderLanding() {
  document.body.classList.add('landing');
  nav.hidden = true;
  const loginBtn = raw(`<button class="btn btn-google" data-login>${GOOGLE_ICON} Entrar con Google</button>`);
  view.innerHTML = html`
    <article class="cover-page">
      <div class="corner-ribbon" aria-hidden="true"><span>Para coleccionistas de<br>Aventuras en la Marca del Este</span></div>
      <p class="module-code" aria-hidden="true">E1</p>

      <header class="cover-head">
        <img src="assets/icons/seal.svg" alt="" class="cover-seal" width="84" height="84">
        <h1 class="cover-title">Escriba de la Marca</h1>
        <div class="cover-rule" aria-hidden="true"><span></span></div>
        <p class="cover-sub">Aplicación para coleccionistas de todos los niveles</p>
      </header>

      <figure class="cover-art" aria-hidden="true">
        <div class="mock">
          <div class="mock-screen">
            <div class="mock-scan"><span></span></div>
            <div class="mock-card is-owned">
              <div class="cover cover-ph mock-cover"><span>N</span></div>
              <div>
                <p class="badge badge-ok">Ya registrado</p>
                <p class="mock-title"><span class="code">B24</span> La Niebla</p>
                <p class="mock-text">Lo añadiste el <strong>12 de marzo de 2025</strong>.</p>
              </div>
            </div>
            <ul class="mock-bars">
              <li><span>Aventuras serie B</span><b style="--p:62%"></b><em>26/42</em></li>
              <li><span>Ambientación</span><b style="--p:38%"></b><em>3/8</em></li>
              <li><span>Reglamento</span><b style="--p:100%"></b><em>3/3</em></li>
            </ul>
          </div>
        </div>
      </figure>

      <p class="cover-blurb">
        Más allá de las estanterías abarrotadas, entre cajas rojas y módulos grapados, se dice que hay una colección
        que ningún aventurero ha logrado catalogar jamás. ¿Quién será tan valiente como para escanear cada código de barras
        y descubrir, por fin, qué módulos le faltan?
      </p>

      <div class="cover-cta">
        ${loginBtn}
        <p class="small">Gratis · solo necesitas tu cuenta de Google</p>
      </div>

      <img src="assets/icons/seal.svg" alt="" class="cover-emblem" width="64" height="64">
    </article>

    <section class="features">
      <article>
        <span class="feature-icon" aria-hidden="true">📚</span>
        <h2>Toda la Marca, ordenada</h2>
        <p>Más de 100 publicaciones catalogadas por serie y categoría: módulos B, X, C, Gazetteer, Xorandor…
          Con el recuento de lo que tienes y lo que te falta.</p>
      </article>
      <article>
        <span class="feature-icon" aria-hidden="true">📷</span>
        <h2>Escanea y listo</h2>
        <p>Enfoca el código de barras: si ya lo tienes te dice desde cuándo; si no, lo añades con un toque.
          ¿Un módulo antiguo sin código? Escribe el de la portada (B1, X2…).</p>
      </article>
      <article>
        <span class="feature-icon" aria-hidden="true">☁️</span>
        <h2>En todos tus dispositivos</h2>
        <p>Tu colección se guarda en tu cuenta y se sincroniza entre el móvil y el ordenador.
          Instálala en la pantalla de inicio como una app más.</p>
      </article>
      <article>
        <span class="feature-icon" aria-hidden="true">🤝</span>
        <h2>Catálogo de la comunidad</h2>
        <p>¿Falta un libro o un código? Proponlo desde la app y, tras revisarlo, lo tendrán todos.</p>
      </article>
    </section>

    <section class="landing-panel coffee">
      <h2>Gratis, y con extras para Mecenas</h2>
      <p>Escriba de la Marca es gratuita. Si te resulta útil, invítame a un café (${SUPPORTER_MIN_AMOUNT} €) y
        desbloqueas el diario de partidas, la lista de deseos compartible, repetidos e intercambio, préstamos, estadísticas y el tema Pergamino.</p>
      <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a>
    </section>

    <section class="landing-cta">
      <h2>Empieza tu biblioteca</h2>
      ${loginBtn}
    </section>

    ${raw(OSR_BANNER)}

    <footer class="landing-footer">
      <p class="small">
        Hecho por <a href="https://github.com/Favashi" rel="noopener">Toni Ruiz (Favashi)</a>, también autor de OSR Manager.<br>
        Proyecto de fans, no oficial. <em>Aventuras en la Marca del Este</em> pertenece a sus autores.<br>
        <a href="privacidad.html">Privacidad</a> ·
        <a href="https://github.com/Favashi/escribadelamarca" rel="noopener">Código (AGPL-3.0)</a>
      </p>
    </footer>`;
  view.querySelectorAll('[data-login]').forEach((btn) => (btn.onclick = async () => {
    view.querySelectorAll('[data-login]').forEach((b) => (b.disabled = true));
    try { await signInWithGoogle(); } catch (err) {
      toast(err.message, 'error');
      view.querySelectorAll('[data-login]').forEach((b) => (b.disabled = false));
    }
  }));
}

// Banner de OSR Manager con el estilo de su web (tema Fósforo Verde, franja y marco doble).
const OSR_BANNER = `
  <aside class="osr-banner" aria-label="OSR Manager">
    <div class="osr-hero">
      <div class="osr-code" aria-hidden="true">OSR-01</div>
      <div class="osr-ribbon" aria-hidden="true">PORTABLE<br>SIN INSTALAR</div>
      <pre class="osr-logo" aria-hidden="true"> ██████╗ ███████╗██████╗
██╔═══██╗██╔════╝██╔══██╗
██║   ██║███████╗██████╔╝
██║   ██║╚════██║██╔══██╗
╚██████╔╝███████║██║  ██║
 ╚═════╝ ╚══════╝╚═╝  ╚═╝</pre>
      <h2 class="osr-title">OSR MANAGER</h2>
      <p class="osr-tag">Herramienta para directores de juego</p>
      <p class="osr-tagline">Una ayuda de mesa para dirigir partidas OSR: exploración, hexcrawl, encuentros y combate.</p>
      <div class="osr-cta">
        <a class="osr-btn" href="https://favashi.github.io/osr-manager/app/" rel="noopener">Abrir OSR Manager →</a>
      </div>
      <p class="osr-secondary"><a href="https://favashi.github.io/osr-manager/" rel="noopener">Ver la web del proyecto</a></p>
    </div>
  </aside>`;

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
  updateAdminBadge();
  showWhatsNewIfUpdated();
  trackOpen(session.user.id);
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
route('/revision', mount(renderReview));
route('/buscar', mount(renderFinder));
route('/admin', mount(renderAdmin));
route('/admin/:section', mount(renderAdmin));

async function boot() {
  restoreTheme(false);
  if (!isConfigured) return renderSetup();

  // Lista de deseos compartida: pública, sin login
  const shared = location.hash.match(/^#\/deseos\/([0-9a-f-]{36})$/i);
  if (shared) {
    document.body.classList.add('landing');
    nav.hidden = true;
    return renderPublicWishlist(view, shared[1]);
  }

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
