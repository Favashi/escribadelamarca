import { html, raw, $, toast, fmtShort } from '../util.js';
import { state, user, isSupporter, isAdmin, loadAll } from '../store.js';
import { signOut } from '../auth.js';
import { viewHeader, confirmDialog, errMsg, releaseNotesDialog, onboardingDialog, typeToConfirmDialog, feedbackDialog } from '../ui.js';
import { sendFeedback, updateProfile } from '../api.js';

const ISSUES_URL = 'https://github.com/Favashi/escribadelamarca/issues/new';
import { icon, ribbon } from '../icons.js';
import { downloadAllJson } from '../export.js';
import { contributions, rankOf, RANKS, describe } from '../achievements.js';
import { getAchievements } from '../api.js';
import { APP_VERSION } from '../version.js';
import { checkForUpdate, reloadApp } from '../update.js';
import { resetLibrary, deleteMyAccount } from '../api.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from '../config.js';
import { settings } from '../settings.js';
import { applyTheme, getTheme, THEMES, TEXT_SIZES, getTextSize, applyTextSize } from '../theme.js';

export function renderProfile(root) {
  const p = state.profile ?? {};
  const email = state.session.user.email;
  const supporter = isSupporter();
  const theme = getTheme();

  root.innerHTML = html`
    ${raw(viewHeader('Perfil'))}
    <section class="panel profile">
      ${p.avatar_url ? raw(html`<img class="avatar" src="${p.avatar_url}" alt="" referrerpolicy="no-referrer">`) : raw(`<div class="avatar avatar-ph" aria-hidden="true">${icon('user')}</div>`)}
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

    <a class="panel wish-link" href="#/deseos">
      <span class="rank-icon" aria-hidden="true">${raw(icon('star'))}</span>
      <span><strong>Lista de deseos</strong><small>${state.wishlist.size
        ? `${state.wishlist.size} ${state.wishlist.size === 1 ? 'libro' : 'libros'} · compártela con tu grupo`
        : 'Apunta lo que te falta y compártela con tu grupo'}</small></span>
      ${raw(icon('chevron'))}
    </a>

    ${raw(rankCard())}

    <section class="panel achievements">
      <h2>Logros</h2>
      <div class="ach-grid"><p class="muted small">Cargando…</p></div>
    </section>

    ${supporter ? raw(html`
    <section class="panel perk mecenas-hub">${raw(ribbon('perk'))}
      <h2>Tus extras de Mecenas</h2>
      <div class="hub-grid">
        ${HUB.map(([sec, icon, title, sub]) => raw(html`<a class="hub-tile" href="#/mecenas/${sec}">
          <span class="hub-icon" aria-hidden="true">${icon}</span><span class="hub-title">${title}</span><span class="hub-sub">${sub}</span>
        </a>`))}
      </div>
      ${settings.donations_enabled ? raw(html`<div class="actions"><a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">${raw(icon('coffee'))} Invítame a otro café</a></div>`) : ''}
    </section>`) : !settings.donations_enabled ? '' : raw(html`
    <section class="panel coffee">
      <h2>¿Te es útil la app?</h2>
      <p>Escriba de la Marca es gratuita y se mantiene con aportaciones. Con un café (${SUPPORTER_MIN_AMOUNT} €) te haces Mecenas y
        desbloqueas diario de partidas, repetidos e intercambio, préstamos, estadísticas y temas extra.</p>
      <div class="actions">
        <a class="btn btn-perk-cta" href="#/mecenas">★ Ver ventajas de Mecenas</a>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">${raw(icon('coffee'))} Invítame a un café</a>
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
      <h3 class="setting-title">${raw(icon('text'))} Tamaño de letra</h3>
      <div class="seg text-seg" role="radiogroup" aria-label="Tamaño de letra">
        ${TEXT_SIZES.map((t) => raw(html`<label><input type="radio" name="text-size" value="${t.id}" ${getTextSize() === t.id ? 'checked' : ''}>
          <span><b style="font-size:${t.scale * 1.15}rem" aria-hidden="true">Aa</b>${t.label}</span></label>`))}
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
        <p class="muted small">Quita todos los libros de tu biblioteca y tu lista de deseos${isSupporter() ? ' y tus préstamos' : ''}.
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
        <a class="btn btn-ghost" href="#/ayuda">${raw(icon('help'))} Ayuda</a>
        <button class="btn btn-ghost" data-changelog>Novedades</button>
        <button class="btn btn-ghost" data-update>Buscar actualizaciones</button>
      </div>
      ${settings.feedback_enabled
        ? raw(`<button class="btn btn-primary btn-feedback" data-feedback>${icon('chat')} Enviar comentario o informar de un fallo</button>`)
        : raw(html`<a class="btn btn-ghost btn-feedback" href="${ISSUES_URL}" target="_blank" rel="noopener">${raw(icon('bug'))} Informar de un fallo o proponer una idea en GitHub</a>
          <p class="muted small center">Los comentarios se gestionan en GitHub: así puedes ver si alguien ya ha informado del mismo fallo.</p>`)}
    </section>

    <p class="muted small center pad">
      Hecho por <a href="https://github.com/Favashi" target="_blank" rel="noopener">Toni Ruiz (Favashi)</a> ·
      <a href="https://favashi.github.io/osr-manager/" target="_blank" rel="noopener">OSR Manager</a><br>
      Proyecto de fans, no oficial · Portadas © de sus autores, con permiso de La Marca del Este<br>
      <a href="privacidad.html">Privacidad</a> ·
      <a href="https://github.com/Favashi/escribadelamarca" target="_blank" rel="noopener">Código</a></p>
    <div class="center pad"><button class="btn btn-ghost btn-sm" data-onboarding>${raw(icon('wave'))} Ver la bienvenida otra vez</button></div>`;

  root.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => applyTheme(r.value, true)));
  root.querySelectorAll('input[name=text-size]').forEach((r) => r.addEventListener('change', () => applyTextSize(r.value, true)));
  $('[data-scribes-opt]', root)?.addEventListener('change', async (e) => {
    const on = e.target.checked;
    e.target.disabled = true;
    try {
      await updateProfile(user().id, { show_in_scribes: on });
      state.profile.show_in_scribes = on;
      toast(on ? 'Tu nombre aparecerá en la página de Escribas' : 'Ya no apareces en la página de Escribas', 'ok');
    } catch (err) { e.target.checked = !on; toast(errMsg(err), 'error'); }
    e.target.disabled = false;
  });
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

  fillAchievements($('.ach-grid', root));

  $('[data-export-all]', root).onclick = () => downloadAllJson().catch((err) => toast(errMsg(err), 'error'));
  $('[data-changelog]', root).onclick = () => releaseNotesDialog();
  $('[data-feedback]', root)?.addEventListener('click', async () => {
    const res = await feedbackDialog();
    if (!res) return;
    try {
      await sendFeedback({ ...res, page: 'perfil', app_version: APP_VERSION, user_agent: navigator.userAgent.slice(0, 300) });
      toast('¡Gracias! Tu comentario ha llegado', 'ok');
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  $('[data-onboarding]', root).onclick = async () => {
    const choice = await onboardingDialog();
    if (choice === 'scan') location.hash = '#/escanear';
    if (choice === 'catalog') location.hash = '#/catalogo';
    if (choice === 'help') location.hash = '#/ayuda';
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
  ['intercambio', '⇄', 'Intercambio', 'Repetidos entre Mecenas'],
  ['prestamos', '↔', 'Préstamos', 'Qué tienes prestado'],
  ['exportar', '⤓', 'Exportar', 'CSV o JSON'],
];

/** Tarjeta de rango de escriba: aportaciones aceptadas y progreso hasta el siguiente. */
function rankCard() {
  const c = contributions();
  const r = rankOf(c.total);
  const prevMin = RANKS[r.index].min;
  const pct = r.next ? Math.round(((c.total - prevMin) / (r.next.min - prevMin)) * 100) : 100;
  return html`<section class="panel rank-card">
    <div class="rank-head">
      <span class="rank-icon" aria-hidden="true">${raw(icon('quill'))}</span>
      <div><p class="eyebrow">Rango de escriba</p><h2>${r.name}</h2></div>
    </div>
    <span class="bar" role="img" aria-label="${c.total} aportaciones aceptadas"><span style="width:${pct}%"></span></span>
    <p class="small muted">${r.next
      ? `${r.toNext} ${r.toNext === 1 ? 'aportación aceptada más' : 'aportaciones aceptadas más'} para ser ${r.next.name}.`
      : 'Has alcanzado el rango más alto. ¡Gracias por tanto!'}
      Sube proponiendo códigos al escanear, sugiriendo correcciones o proponiendo libros que falten.</p>
    ${c.total ? raw(html`<p class="small rank-detail">${c.suggestions} sugerencias · ${c.codes} códigos · ${c.books} libros aceptados</p>`) : ''}
    <div class="scribes-opt">
      <label class="switch"><input type="checkbox" data-scribes-opt ${state.profile?.show_in_scribes ? 'checked' : ''}>
        <span>Mostrar mi nombre en la página de Escribas</span></label>
      <a href="#/escribas">Ver los Escribas ${raw(icon('chevron'))}</a>
    </div>
  </section>`;
}

/** Vitrina de logros conseguidos (se cargan de la base de datos). */
async function fillAchievements(box) {
  if (!box) return;
  let rows = state.achievements;
  if (!rows.length) { try { rows = await getAchievements(); state.achievements = rows; } catch { rows = []; } }
  const order = (k) => (k.startsWith('series:') ? 0 : k.startsWith('rank:') ? 1 : k.startsWith('books:') ? 2 : 3);
  rows = [...rows].sort((a, b) => order(a.key) - order(b.key) || String(b.earned_at).localeCompare(String(a.earned_at)));
  box.innerHTML = rows.length ? rows.map((r) => {
    const d = describe(r.key, r);
    return html`<div class="ach">
      <span class="ach-icon" aria-hidden="true">${raw(icon(d.icon))}</span>
      <div><strong>${d.title}${r.level > 1 ? raw(html` <span class="ach-level">×${r.level}</span>`) : ''}</strong>
        <small>${d.text}</small><small class="muted">${fmtShort(r.earned_at)}</small></div>
    </div>`;
  }).join('') : html`<p class="muted small">Aún no tienes logros. Escanea tus primeros libros o completa una serie. ✦</p>`;
}
