import { isConfigured } from './supabase.js';
import { icon } from './icons.js';
import { getSession, onAuthChange, signInWithGoogle } from './auth.js';
import { state, loadAll, isSupporter, isAdmin, pendingCount, refreshShared } from './store.js';
import { route, start, resolve } from './router.js';
import { html, raw, $, $$, toast, cover } from './util.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from './config.js';
import { landingShowcase } from './api.js';
import { emblemBadge } from './hero.js';
import { settings, loadSettings } from './settings.js';
import { renderAnnouncement } from './announcement.js';
import { restoreTheme, applyTextSize, getTextSize } from './theme.js';
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
import { renderHelp } from './views/help.js';
import { renderCommunity } from './views/community.js';
import { renderContributions, waxSeal } from './views/contributions.js';
import { renderPublicProfile } from './views/profile-public.js';
import { renderSettings } from './views/settings.js';
import { renderWishlist } from './views/wishlist.js';
import { updateAdminBadge } from './nav.js';
import { showWhatsNewIfUpdated, onboardingDialog } from './ui.js';
import { trackOpen } from './track.js';
import { watchForUpdates } from './update.js';
import { reportError } from './errors.js';
import { captureRef, rememberRef, trackLandingVisit, saveSignupRef } from './referral.js';

const view = $('#view');
const nav = $('#nav');

function setActiveNav() {
  const path = location.hash.slice(1) || '/biblioteca';
  const section = path.startsWith('/revision') ? '/admin'
    : /^\/(ayuda|escribas|deseos|ajustes)/.test(path) ? '/perfil' : path;
  $$('#nav a').forEach((a) => a.classList.toggle('active', section.startsWith(a.getAttribute('href').slice(1))));
  if (state.session) updateAdminBadge();
}

const GOOGLE_ICON = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

// ---------- Portada: portadas al azar, ejemplos y cifras (landing_showcase) ----------
const LANDING_EMBLEMS = ['dragon-head', 'owl', 'dice-twenty-faces-twenty', 'quill-ink', 'wolf-head', 'crown', 'skull-crossed-bones', 'dwarf-face', 'spell-book'];
// Ejemplos mientras llegan (o si fallan) los datos reales: portadas genéricas con sus iniciales
const DEMO_BOOKS = [
  { code: 'B24', title: 'La Niebla' }, { code: 'B13', title: 'Sangre en la Nieve' },
  { code: 'X2', title: 'El Arca de los Mil Inviernos' }, { code: 'B7', title: 'Presentes Sangrientos' },
];
// Las cifras de personas solo se enseñan a partir de un mínimo (con pocas, restan en vez de sumar)
const MIN_SCRIBES = 50, MIN_SUPPORTERS = 20;
const fmtN = (n) => Number(n || 0).toLocaleString('es-ES');

/**
 * Muro de portadas de la cabecera: columnas inclinadas que suben y bajan despacio. Cada columna repite sus portadas
 * para que el bucle no tenga corte. Sin portadas (desactivadas o sin datos), queda el fondo morado.
 */
function fillWall(wall, urls) {
  if (urls.length < 8) { wall.innerHTML = ''; return; }
  const cols = Math.max(4, Math.min(9, Math.round(window.innerWidth / 140)));
  const per = Math.max(4, Math.floor(urls.length / cols));
  wall.innerHTML = Array.from({ length: cols }, (_, c) => {
    const col = Array.from({ length: per }, (__, k) => urls[(c * per + k) % urls.length]);
    return `<div class="lp-col">${[...col, ...col].map((u) => `<img src="${u}" alt="" decoding="async">`).join('')}</div>`;
  }).join('');
  wall.closest('.lp-hero').classList.add('has-wall');
}

function fillShowcase(data) {
  const books = data?.covers?.length ? data.covers : DEMO_BOOKS;
  const wall = $('.lp-wall', view);
  if (!wall) return;
  fillWall(wall, (data?.covers || []).map((b) => b.cover_url));

  const [scan, ...rest] = books;
  $('[data-demo-scan]', view).innerHTML = html`${raw(cover(scan, 'lp-demo-cover'))}
    <div><span class="lp-pill">Ya lo tienes</span><strong>${scan.code} · ${scan.title}</strong><small>Lo añadiste el 12 de marzo de 2025</small></div>`;
  const wish = [data?.oop ? { ...data.oop, out_of_print: true } : null, ...rest.slice(0, 3)].filter(Boolean).slice(0, 3);
  $('[data-demo-wish]', view).innerHTML = wish.map((b) => html`<li>${raw(cover(b, 'cover-xs'))}<span>${b.code} · ${b.title}
    <small>${b.out_of_print ? 'Descatalogado: búscalo de segunda mano' : 'Me falta'}</small></span></li>`).join('');

  const stats = $('.lp-stats', view);
  if (!data) return;
  const items = [[data.publications, 'publicaciones'], [data.authors, 'autores'], [data.adventures, 'aventuras en el buscador'],
    [data.books_cataloged, 'libros ya catalogados']].filter(([n]) => n > 0);
  stats.innerHTML = items.map(([n, l]) => html`<div><b>${fmtN(n)}</b><span>${l}</span></div>`).join('');
  stats.hidden = !items.length;
  const people = [data.scribes >= MIN_SCRIBES && `<strong>${fmtN(data.scribes)} escribas</strong> que mejoran el catálogo`,
    data.supporters >= MIN_SUPPORTERS && `<strong>${fmtN(data.supporters)} mecenas</strong> que la sostienen`].filter(Boolean);
  if (people.length === 2) $('.lp-thanks-line', view).innerHTML = `Gracias a los ${people.join(' y a los ')}.`;
}

function renderLanding() {
  document.body.classList.add('landing');
  nav.hidden = true;
  const loginBtn = raw(`<button class="btn btn-google" data-login>${GOOGLE_ICON} Entrar con Google</button>`);
  const G = 'https://github.com/Favashi/escribadelamarca';
  view.innerHTML = html`
    <section class="lp-hero">
      <div class="lp-wall" aria-hidden="true"></div>
      <div class="lp-veil" aria-hidden="true"></div>
      <div class="lp-ribbon" aria-hidden="true"><span>Para coleccionistas de<br>Aventuras en la Marca del Este</span></div>
      <div class="lp-hero-text">
        <img class="lp-seal" src="assets/icons/seal.svg" alt="" width="96" height="96">
        <h1 class="lp-title">Escriba de la Marca</h1>
        <p class="lp-promise">Escanea tus libros y sabrás al momento <em>si ya lo tienes</em> y <em>qué te falta</em>.</p>
        <div class="lp-cta">${loginBtn}<small>Gratis · sin anuncios · se instala en el móvil como una app</small></div>
      </div>
    </section>

    <div class="lp-stats" hidden></div>

    <h2 class="lp-sec">Cómo funciona</h2>
    <p class="lp-sec-sub">Tres pasos. El primero lo haces en la tienda, delante de la estantería.</p>
    <div class="lp-steps">
      <article class="lp-step">
        <h3><i>1</i>Escanea</h3>
        <div class="lp-demo"><div class="lp-scanline"></div><div class="lp-scanres" data-demo-scan></div></div>
        <p>Enfoca el código de barras y te dice al momento si ya lo tienes, y desde cuándo. ¿Un módulo antiguo sin código?
          Escribe el de la portada (B1, X2…).</p>
      </article>
      <article class="lp-step">
        <h3><i>2</i>Mira qué te falta</h3>
        <div class="lp-demo">
          <div class="lp-series-h">Serie B <span>13 / 18</span></div>
          <div class="lp-tiles">${Array.from({ length: 18 }, (_, i) => raw(html`<span class="lp-tile ${[6, 12, 14, 16, 17].includes(i) ? 'miss' : 'own'}">B${i + 1}</span>`))}</div>
          <p class="lp-faltan">Te faltan: <b>B7, B13, B15, B17, B18</b></p>
        </div>
        <p>Cada serie con sus huecos a la vista, y aviso cuando sale un módulo nuevo en las series que coleccionas.</p>
      </article>
      <article class="lp-step">
        <h3><i>3</i>Complétala</h3>
        <div class="lp-demo"><ul class="lp-wl" data-demo-wish></ul><span class="lp-share">Compartir mi lista</span></div>
        <p>Apunta lo que te falta en tu lista de deseos y compártela con tu grupo o tu familia: la ven sin registrarse.
          Ideal para regalos.</p>
      </article>
    </div>

    <h2 class="lp-sec">Y además</h2>
    <p class="lp-sec-sub">Pensada por y para jugadores de la Marca.</p>
    <div class="lp-features">
      ${[['compass', 'Buscador de aventuras', '¿Qué preparo para la próxima partida? Filtra por nivel del grupo, jugadores y duración.'],
        ['dice', 'Leída, jugada y dirigida', 'Marca cada libro y encuentra las aventuras que tu grupo aún no ha jugado.'],
        ['warning', 'Descatalogados', 'Sabrás qué módulos ya no se venden nuevos para buscarlos de segunda mano a tiempo.'],
        ['quill', 'Misiones y niveles', 'Completa misiones para mejorar el catálogo, gana experiencia, sube de nivel y elige tu emblema.'],
        ['people', 'Catálogo de la comunidad', '¿Falta un libro o un código? Proponlo y, tras revisarlo, lo tendrán todos.'],
        ['cloud', 'En todos tus dispositivos', 'Tu colección se sincroniza entre el móvil y el ordenador. Sin instalar nada de ninguna tienda.'],
      ].map(([ic, t, d]) => raw(html`<div class="lp-feat"><span class="lp-ic" aria-hidden="true">${raw(icon(ic))}</span><div><h3>${t}</h3><p>${d}</p></div></div>`))}
    </div>

    <h2 class="lp-sec">Una comunidad de escribas</h2>
    <p class="lp-sec-sub">Acepta misiones, completa el catálogo de la Marca y gana experiencia: cuanto más esfuerzo, más PX.</p>
    <div class="lp-quest-demo">
      <article class="quest">
        ${raw(waxSeal(150))}
        <span class="quest-kind">Serie B · Datos de juego</span>
        <h3>Los pergaminos en blanco de la serie B</h3>
        <p>13 aventuras esperan a que alguien anote su nivel, sus jugadores y sus sesiones.</p>
        <div class="progress"><i><b style="width:69%"></b></i><span>29 de 42 completas entre todos</span></div>
        <span class="quest-cta">Aceptar la misión →</span>
      </article>
      <article class="quest">
        ${raw(waxSeal(200))}
        <span class="quest-kind">Resúmenes</span>
        <h3>La crónica inacabada de <em>La Ciudad Olvidada</em></h3>
        <p>Esta aventura no tiene resumen. Dos o tres frases sin destripar la trama bastan.</p>
        <span class="quest-cta">Escribir la crónica →</span>
      </article>
    </div>
    <section class="lp-community">
      <p>Cada código escaneado y cada corrección mejora el catálogo para todos.</p>
      <div class="lp-coins" aria-hidden="true">${LANDING_EMBLEMS.map((k, i) => raw(emblemBadge(k, { size: 'md', gold: i % 3 === 0 })))}</div>
      <p class="lp-thanks-line">Gracias a los <strong>escribas</strong> que mejoran el catálogo y a los <strong>mecenas</strong> que la sostienen.</p>
      <p class="lp-thanks">Portadas © de sus autores, mostradas con permiso de La Marca del Este. ¡Gracias!</p>
    </section>

    <h2 class="lp-sec">Preguntas frecuentes</h2>
    <div class="lp-faq">
      <details><summary>¿Es una app oficial?</summary><p>No. Es un proyecto de fans, gratuito y
        <a href="${G}" target="_blank" rel="noopener">de código abierto</a>. <em>Aventuras en la Marca del Este</em> pertenece a sus
        autores; las portadas se muestran con permiso de La Marca del Este.</p></details>
      <details><summary>¿Cuesta algo?</summary><p>No, y no tiene anuncios. Si te resulta útil, puedes invitarme a un café y hacerte
        Mecenas, con algunos extras.</p></details>
      <details><summary>¿Qué hacéis con mis datos?</summary><p>Solo lo necesario para guardar tu colección: tu cuenta de Google y tus
        libros. No se venden ni se comparten, y puedes descargarlos o borrar tu cuenta cuando quieras. Y como
        <a href="${G}" target="_blank" rel="noopener">el código es público</a>, cualquiera puede comprobar qué se guarda.
        <a href="privacidad.html">Privacidad</a>.</p></details>
      <details><summary>¿Funciona en iPhone y Android?</summary><p>Sí: se abre en el navegador y se añade a la pantalla de inicio como
        una app más. También en el ordenador.</p></details>
    </div>

    <div class="lp-row2">
      ${settings.donations_enabled ? raw(html`<section class="lp-mecenas">
        <h3>Gratis, y con extras para Mecenas</h3>
        <p>Con un café (${SUPPORTER_MIN_AMOUNT} €) desbloqueas el diario de partidas, repetidos e intercambio, préstamos, estadísticas,
          los temas Pergamino y Retro EGA… y el marco de moneda antigua para tu emblema.</p>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">${raw(icon('coffee'))} Invítame a un café</a>
      </section>`) : ''}
      <aside class="lp-osr" aria-label="OSR Manager">
        <pre class="lp-osr-logo" aria-hidden="true"> ██████╗ ███████╗██████╗
██╔═══██╗██╔════╝██╔══██╗
██║   ██║███████╗██████╔╝
██║   ██║╚════██║██╔══██╗
╚██████╔╝███████║██║  ██║
 ╚═════╝ ╚══════╝╚═╝  ╚═╝</pre>
        <b>OSR MANAGER</b>
        <p>Del mismo autor: ayuda de mesa para directores de juego OSR (exploración, hexcrawl, encuentros y combate).</p>
        <div class="lp-osr-links">
          <a class="lp-osr-btn" href="https://favashi.github.io/osr-manager/?ref=escriba-de-la-marca" rel="noopener">Conocer OSR Manager →</a>
          <a class="lp-osr-app" href="https://favashi.github.io/osr-manager/app/?ref=escriba-de-la-marca" rel="noopener">o ábrelo directamente</a>
        </div>
      </aside>
    </div>

    <section class="lp-final">
      <h2>Empieza tu biblioteca</h2>
      ${loginBtn}
    </section>

    <footer class="landing-footer">
      <p class="small">
        Hecho por <a href="https://github.com/Favashi" rel="noopener">Toni Ruiz (Favashi)</a>, también autor de OSR Manager.<br>
        Proyecto de fans, no oficial. <em>Aventuras en la Marca del Este</em> pertenece a sus autores.<br>
        Portadas © de sus autores, usadas con permiso de La Marca del Este.<br>
        <a href="privacidad.html">Privacidad</a> ·
        <a href="${G}" rel="noopener">Código en GitHub (AGPL-3.0)</a>
      </p>
    </footer>`;
  fillShowcase(null);
  try {
    if (sessionStorage.getItem('edm.deleted')) {
      sessionStorage.removeItem('edm.deleted');
      toast('Tu cuenta y todos tus datos se han eliminado.', 'ok');
    }
  } catch { /* sin storage */ }
  showCoffeeWidget();
  landingShowcase().then(fillShowcase).catch(() => {});
  trackLandingVisit();
  view.querySelectorAll('[data-login]').forEach((btn) => (btn.onclick = async () => {
    view.querySelectorAll('[data-login]').forEach((b) => (b.disabled = true));
    try { await signInWithGoogle(); } catch (err) {
      toast(err.message, 'error');
      view.querySelectorAll('[data-login]').forEach((b) => (b.disabled = false));
    }
  }));
}

// Botón flotante de Buy Me a Coffee: solo en la portada (sin sesión) y con las donaciones activadas.
// Se carga una vez; dentro de la app lo oculta el CSS (body sin .landing).
function showCoffeeWidget() {
  if (!settings.donations_enabled || document.querySelector('script[data-name="BMC-Widget"]')) return;
  const s = document.createElement('script');
  Object.assign(s.dataset, {
    name: 'BMC-Widget', cfasync: 'false', id: 'toniruiz', description: '¡Invítame a un café!', message: '',
    color: '#FFDD00', position: 'Right', x_margin: '18', y_margin: '18',
  });
  s.src = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js';
  // El widget se monta al recibir DOMContentLoaded, que ya pasó: se vuelve a lanzar cuando carga
  s.onload = () => window.dispatchEvent(new Event('DOMContentLoaded'));
  document.body.append(s);
}

function renderSetup() {
  nav.hidden = true;
  view.innerHTML = html`<section class="hero"><h1>Falta configuración</h1>
    <p>Rellena <code>js/config.js</code> con la URL y la anon key de tu proyecto Supabase. Consulta el README.</p></section>`;
}

let routerStarted = false;
let currentUid = null;

// Al volver a la app (y cada 2 min si eres admin), recarga propuestas y comentarios: la app instalada no se puede
// recargar a mano. Solo repinta Revisión/Admin si ha cambiado lo pendiente y no hay un diálogo ni un campo en uso.
let syncWired = false;
function wireSharedSync() {
  if (syncWired) return;
  syncWired = true;
  const sync = async () => {
    if (!state.session || document.visibilityState !== 'visible') return;
    const before = pendingCount();
    if (!(await refreshShared().catch(() => false))) return;
    updateAdminBadge();
    const busy = document.getElementById('dialog')?.open || document.activeElement?.matches('input, textarea, select');
    if (pendingCount() !== before && /^#\/(revision|admin)/.test(location.hash) && !busy) resolve();
  };
  document.addEventListener('visibilitychange', sync);
  setInterval(() => { if (isAdmin()) sync(); }, 120000);
}

async function enterApp(session) {
  state.session = session;
  document.body.classList.remove('landing');
  view.innerHTML = '<div class="loading" aria-busy="true">Abriendo el grimorio…</div>';
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    reportError('error', `No se pudieron cargar los datos: ${e?.message || e}`, { stack: e?.stack });
    view.innerHTML = html`<div class="empty"><h2>No se pudieron cargar los datos</h2><p class="muted">${e.message}</p>
      <button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  // Cuenta suspendida por el admin: aviso y salir (la base de datos ya bloquea cualquier escritura)
  if (state.profile?.suspended_at) {
    nav.hidden = true;
    view.innerHTML = html`<div class="empty suspended">
      <h2>Tu cuenta está suspendida</h2>
      ${state.profile.suspended_reason ? raw(html`<p>${state.profile.suspended_reason}</p>`) : ''}
      <p class="muted">Si crees que es un error, escribe a <strong>info@toniruiz.es</strong>.</p>
      <button class="btn btn-ghost" data-logout>Cerrar sesión</button></div>`;
    $('[data-logout]', view).onclick = async () => { const { signOut } = await import('./auth.js'); await signOut(); location.reload(); };
    return;
  }
  restoreTheme(isSupporter());
  saveSignupRef(state.profile);
  nav.hidden = false;
  updateAdminBadge();
  showWhatsNewIfUpdated();
  wireSharedSync();
  trackOpen(session.user.id);
  maybeOnboard();
  import('./achievements.js').then((m) => m.checkAchievements()).catch(() => {});
  if (!routerStarted) {
    routerStarted = true;
    window.addEventListener('hashchange', setActiveNav);
    await start();
  } else {
    await resolve();
  }
  setActiveNav();
}

/** Bienvenida la primera vez que entra alguien sin libros en su biblioteca. */
function maybeOnboard() {
  let done = false;
  try { done = localStorage.getItem('edm.onboarded') === '1'; } catch { /* sin storage */ }
  if (done || state.library.size) return;
  setTimeout(async () => {
    const choice = await onboardingDialog();
    try { localStorage.setItem('edm.onboarded', '1'); } catch { /* sin storage */ }
    if (choice === 'scan') location.hash = '#/escanear';
    if (choice === 'catalog') location.hash = '#/catalogo';
    if (choice === 'help') location.hash = '#/ayuda';
  }, 400);
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
route('/catalogo/:filtro', mount(renderCatalog));   // admin: con un filtro de calidad ya aplicado
route('/libro/:id', mount(renderBook));
route('/perfil', mount(renderProfile));
route('/ajustes', mount(renderSettings));
route('/ajustes/:section', mount(renderSettings));
route('/mecenas', mount(renderSupporter));
route('/mecenas/:section', mount(renderSupporter));
route('/revision', mount(renderReview));
route('/buscar', mount(renderFinder));
route('/admin', mount(renderAdmin));
route('/admin/usuario/:id', mount((root, { id }) => renderAdmin(root, { section: 'usuario', id })));
route('/admin/:section', mount(renderAdmin));
route('/ayuda', mount(renderHelp));
route('/aportaciones', mount(renderContributions));
route('/escriba/:slug', mount((root, { slug }) => renderPublicProfile(root, slug.toLowerCase())));
route('/comunidad', mount(renderCommunity));
route('/comunidad/:tab', mount(renderCommunity));
route('/escribas', () => { location.replace('#/comunidad/escribas'); });   // enlace antiguo
route('/deseos', mount(renderWishlist));

async function boot() {
  captureRef();
  restoreTheme(false);
  applyTextSize(getTextSize());
  if (!isConfigured) return renderSetup();
  await loadSettings();
  renderAnnouncement();

  // Perfil público de escriba: sin login (con sesión, lo pinta el router)
  const pub = location.hash.match(/^#\/escriba\/([a-z0-9-]{3,30})$/i);
  if (pub && !(await getSession())) {
    document.body.classList.add('landing');
    nav.hidden = true;
    rememberRef('perfil-publico');
    trackLandingVisit();
    return renderPublicProfile(view, pub[1].toLowerCase());
  }

  // Lista de deseos compartida: pública, sin login
  const shared = location.hash.match(/^#\/deseos\/([0-9a-f-]{36})$/i);
  if (shared) {
    document.body.classList.add('landing');
    nav.hidden = true;
    rememberRef('lista-compartida');   // si se registra tras ver una lista compartida
    trackLandingVisit();
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
watchForUpdates();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
