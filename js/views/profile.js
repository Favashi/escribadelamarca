import { html, raw, $, toast } from '../util.js';
import { state, user, isSupporter, isAdmin, loadAll } from '../store.js';
import { signOut } from '../auth.js';
import { viewHeader, confirmDialog, errMsg, releaseNotesDialog, onboardingDialog, typeToConfirmDialog } from '../ui.js';
import { icon, ribbon } from '../icons.js';
import { downloadAllJson } from '../export.js';
import { APP_VERSION } from '../version.js';
import { checkForUpdate, reloadApp } from '../update.js';
import { resetLibrary, deleteMyAccount } from '../api.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from '../config.js';
import { applyTheme, getTheme, THEMES } from '../theme.js';

export function renderProfile(root) {
  const p = state.profile ?? {};
  const email = state.session.user.email;
  const supporter = isSupporter();
  const theme = getTheme();

  root.innerHTML = html`
    ${raw(viewHeader('Perfil'))}
    <section class="panel profile">
      ${p.avatar_url ? raw(html`<img class="avatar" src="${p.avatar_url}" alt="" referrerpolicy="no-referrer">`) : raw('<div class="avatar avatar-ph" aria-hidden="true">🧙</div>')}
      <div class="profile-main">
        <h2>${p.display_name ?? email}</h2>
        <p class="muted small">${email}</p>
        <p>
          ${supporter ? raw(`<span class="badge badge-gold">${icon('star')} Mecenas</span>`) : ''}
          ${isAdmin() ? raw(`<span class="badge badge-admin">${icon('shield')} Admin</span>`) : ''}
        </p>
      </div>
      <button class="btn btn-sm btn-logout" data-logout>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Cerrar sesión
      </button>
    </section>

    ${supporter ? raw(html`
    <section class="panel perk mecenas-hub">${raw(ribbon('perk'))}
      <h2>Tus extras de Mecenas</h2>
      <div class="hub-grid">
        ${HUB.map(([sec, icon, title, sub]) => raw(html`<a class="hub-tile" href="#/mecenas/${sec}">
          <span class="hub-icon" aria-hidden="true">${icon}</span><span class="hub-title">${title}</span><span class="hub-sub">${sub}</span>
        </a>`))}
      </div>
      <div class="actions"><a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Invítame a otro café</a></div>
    </section>`) : raw(html`
    <section class="panel coffee">
      <h2>¿Te es útil la app?</h2>
      <p>Escriba de la Marca es gratuita y se mantiene con aportaciones. Con un café (${SUPPORTER_MIN_AMOUNT} €) te haces Mecenas y
        desbloqueas diario de partidas, lista de deseos compartible, intercambio, estadísticas y temas extra.</p>
      <div class="actions">
        <a class="btn btn-perk-cta" href="#/mecenas">★ Ver ventajas de Mecenas</a>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a>
      </div>
    </section>`)}

    <section class="panel">
      <h2>Apariencia</h2>
      <div class="theme-row" role="radiogroup" aria-label="Tema">
        ${THEMES.filter((t) => !t.supporter).map((t) => raw(themeOption(t, theme, false)))}
      </div>
      <p class="theme-sub">Temas de Mecenas ${supporter ? '' : raw('<a href="#/mecenas">¿Cómo desbloquearlos?</a>')}</p>
      <div class="theme-row two" role="radiogroup" aria-label="Temas de Mecenas">
        ${THEMES.filter((t) => t.supporter).map((t) => raw(themeOption(t, theme, !supporter)))}
      </div>
    </section>

    <details class="panel danger-zone">
      <summary><h2>${raw(icon('warning'))} Zona de peligro</h2><span class="muted small">Vaciar la biblioteca o eliminar la cuenta</span>${raw(icon('chevron', { cls: 'dz-chevron' }))}</summary>

      <div class="dz-item">
        <p class="small">Antes de borrar nada, puedes <strong>descargar una copia de todos tus datos</strong>.</p>
        <button class="btn btn-ghost btn-sm" data-export-all>${raw(icon('download'))} Descargar mis datos (JSON)</button>
      </div>

      <div class="dz-item">
        <h3>Empezar de cero</h3>
        <p class="muted small">Quita todos los libros de tu biblioteca${isSupporter() ? ', tu lista de deseos y tus préstamos' : ''}.
          El catálogo general no se toca.</p>
        <button class="btn btn-danger-outline" data-reset ${state.library.size ? '' : 'disabled'}>${raw(icon('trash'))}
          Vaciar mi biblioteca (${state.library.size} ${state.library.size === 1 ? 'libro' : 'libros'})</button>
      </div>

      <div class="dz-item">
        <h3>Eliminar mi cuenta</h3>
        <p class="muted small">Borra tu cuenta y todos tus datos: biblioteca, lista de deseos, préstamos, diario de partidas y
          estadísticas de uso. Los libros o códigos que hayas propuesto se quedan en el catálogo común, sin tu nombre.
          <strong>No se puede deshacer.</strong></p>
        <button class="btn btn-danger-outline" data-delete-account>${raw(icon('userX'))} Eliminar mi cuenta</button>
      </div>
    </details>

    <section class="panel about">
      <h2>Acerca de</h2>
      <p class="about-version"><strong>Escriba de la Marca</strong> <span class="badge">v${APP_VERSION}</span></p>
      <div class="actions">
        <button class="btn btn-ghost" data-changelog>Novedades</button>
        <button class="btn btn-ghost" data-update>Buscar actualizaciones</button>
      </div>
    </section>

    <p class="muted small center pad">
      Hecho por <a href="https://github.com/Favashi" target="_blank" rel="noopener">Toni Ruiz (Favashi)</a> ·
      <a href="https://favashi.github.io/osr-manager/" target="_blank" rel="noopener">OSR Manager</a><br>
      Proyecto de fans, no oficial · <a href="privacidad.html">Privacidad</a> ·
      <a href="https://github.com/Favashi/escribadelamarca" target="_blank" rel="noopener">Código</a></p>
    <div class="center pad"><button class="btn btn-ghost btn-sm" data-onboarding>👋 Ver la bienvenida otra vez</button></div>`;

  root.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => applyTheme(r.value, true)));
  $('[data-reset]', root).onclick = async (e) => {
    const n = state.library.size;
    const ok = await confirmDialog(
      `¿Vaciar tu biblioteca? Se quitarán ${n} ${n === 1 ? 'libro' : 'libros'} con sus fechas de registro y notas. No se puede deshacer.`,
      { ok: 'Vaciar biblioteca', danger: true });
    if (!ok) return;
    e.target.disabled = true;
    try {
      await resetLibrary(user().id);
      await loadAll();
      toast('Biblioteca vaciada', 'ok');
      renderProfile(root);
    } catch (err) { toast(errMsg(err), 'error'); e.target.disabled = false; }
  };

  $('[data-delete-account]', root).onclick = async (e) => {
    const ok = await typeToConfirmDialog(
      `Se eliminarán la cuenta ${email}, los ${state.library.size} libros de tu biblioteca y todos tus datos. No se puede deshacer.`,
      { word: 'ELIMINAR', ok: 'Eliminar mi cuenta' });
    if (!ok) return;
    e.target.disabled = true;
    try {
      await deleteMyAccount();
      // La cuenta ya no existe en el servidor: cerrar solo la sesión local y recargar en la portada
      await signOut('local').catch(() => {});
      try { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('edm.deleted', '1'); } catch { /* sin storage */ }
      location.replace(location.pathname);
    } catch (err) { toast(errMsg(err), 'error'); e.target.disabled = false; }
  };

  $('[data-export-all]', root).onclick = () => downloadAllJson().catch((err) => toast(errMsg(err), 'error'));
  $('[data-changelog]', root).onclick = () => releaseNotesDialog();
  $('[data-onboarding]', root).onclick = async () => {
    const choice = await onboardingDialog();
    if (choice === 'scan') location.hash = '#/escanear';
    if (choice === 'catalog') location.hash = '#/catalogo';
  };
  $('[data-update]', root).onclick = async (e) => {
    e.target.disabled = true;
    const v = await checkForUpdate({ force: true });
    if (v) { toast(`Actualizando a la v${v}…`); setTimeout(reloadApp, 600); }
    else { toast('Ya tienes la última versión', 'ok'); e.target.disabled = false; }
  };

  $('[data-logout]', root).onclick = async () => { await signOut(); toast('Sesión cerrada'); };
}

const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>',
  parchment: '<span class="tp-glyph tp-uncial">Aa</span>',
  retro: '<span class="tp-glyph tp-mono">&gt;_</span>',
};

/** Opción de tema con miniatura (al estilo de Ajustes → Pantalla de iOS). */
function themeOption(t, current, locked) {
  return html`<label class="theme-opt ${locked ? 'locked' : ''}">
    <input type="radio" name="theme" value="${t.id}" ${current === t.id ? 'checked' : ''} ${locked ? 'disabled' : ''}>
    <span class="theme-preview tp-${t.id}">${raw(THEME_ICONS[t.id] || '')}</span>
    <span class="theme-name">${locked ? raw(icon('lock', { label: 'Bloqueado' })) : ''}${t.label}</span>
  </label>`;
}

// Accesos directos a los extras de Mecenas (sección de #/mecenas/<sec>)
const HUB = [
  ['coleccion', '▤', 'Estadísticas', 'Progreso y valor'],
  ['diario', '✎', 'Diario de partidas', 'Lo dirigido y jugado'],
  ['deseos', '☆', 'Lista de deseos', 'Y enlace para compartir'],
  ['intercambio', '⇄', 'Intercambio', 'Repetidos entre Mecenas'],
  ['prestamos', '↔', 'Préstamos', 'Qué tienes prestado'],
  ['exportar', '⤓', 'Exportar', 'CSV o JSON'],
];
