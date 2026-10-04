// Ajustes (#/ajustes y #/ajustes/<sección>): todo lo configurable que antes estaba en el Perfil. La lista agrupa
// Cuenta, Privacidad, Apariencia, Mis datos y Ayuda; cada fila abre su sección o hace la acción directamente.
import { html, raw, $, toast } from '../util.js';
import { state, user, isSupporter, loadAll } from '../store.js';
import { signOut } from '../auth.js';
import { confirmDialog, errMsg, releaseNotesDialog, onboardingDialog, typeToConfirmDialog, feedbackDialog } from '../ui.js';
import { sendFeedback, updateProfile, resetLibrary, deleteMyAccount, getAchievements } from '../api.js';
import { icon } from '../icons.js';
import { emblemSvg, EMBLEMS, emblemKey } from '../emblems.js';
import { emblemDialog } from '../hero.js';
import { downloadAllJson } from '../export.js';
import { APP_VERSION } from '../version.js';
import { checkForUpdate, reloadApp } from '../update.js';
import { settings } from '../settings.js';
import { applyTheme, getTheme, THEMES, TEXT_SIZES, getTextSize, applyTextSize } from '../theme.js';
import { profileSettingsHtml, bindProfileSettings } from './profile-public.js';
import { themeName } from '../profile-themes.js';

const ISSUES_URL = 'https://github.com/Favashi/escribadelamarca/issues/new';

/** «Ana García López» → «Ana G.» (igual que public.short_name en la base de datos). */
const shortName = (full) => {
  const [first, second] = String(full ?? '').trim().split(/\s+/);
  return first ? `${first}${second ? ` ${second[0]}.` : ''}` : 'Escriba anónimo';
};

const ic = (name) => raw(`<span class="set-ic" aria-hidden="true">${emblemSvg(name)}</span>`);
const chev = () => raw(`<span class="set-chev" aria-hidden="true">${icon('chevron')}</span>`);
const row = (href, iconName, title, sub = '', cls = '') => html`<a class="set-row ${cls}" href="${href}">${ic(iconName)}
  <span class="set-txt"><b>${title}</b>${sub ? raw(html`<small>${sub}</small>`) : ''}</span>${chev()}</a>`;
const btnRow = (attr, iconName, title, sub = '', cls = '') => html`<button type="button" class="set-row ${cls}" ${raw(attr)}>${ic(iconName)}
  <span class="set-txt"><b>${title}</b>${sub ? raw(html`<small>${sub}</small>`) : ''}</span>${chev()}</button>`;

const SECTIONS = {
  nombre: 'Nombre público',
  'perfil-publico': 'Perfil público',
  apariencia: 'Apariencia',
  datos: 'Mis datos',
};

export function renderSettings(root, params = {}) {
  const sec = params.section;
  if (sec && SECTIONS[sec]) return renderSection(root, sec);
  const p = state.profile ?? {};
  const supporter = isSupporter();
  const theme = THEMES.find((t) => t.id === getTheme())?.label ?? 'Automático';
  const size = TEXT_SIZES.find((t) => t.id === getTextSize())?.label ?? 'Normal';
  const ppTheme = themeName(p.profile_theme || 'oro');

  root.innerHTML = html`
    <header class="set-top"><a class="set-back" href="#/perfil" aria-label="Volver al perfil">${raw(icon('chevron', { cls: 'flip' }))}</a><h1>Ajustes</h1></header>

    <p class="set-group">Cuenta</p>
    <div class="set-list">
      ${raw(row('#/ajustes/nombre', 'hood', 'Nombre público', p.public_name || `${shortName(p.display_name)} (de Google)`))}
      ${raw(btnRow('data-emblem', emblemKey(p.emblem), 'Emblema', EMBLEMS[emblemKey(p.emblem)][0]))}
      ${raw(row('#/ajustes/perfil-publico', 'castle', 'Perfil público', p.public_profile ? `Activado · tema ${ppTheme}` : 'Desactivado'))}
    </div>

    <p class="set-group">Privacidad</p>
    <div class="set-list">
      <label class="set-row">${ic('owl')}<span class="set-txt"><b>Aparecer en la lista de Escribas</b></span>
        <input type="checkbox" class="set-switch" data-opt="show_in_scribes" ${p.show_in_scribes ? 'checked' : ''}></label>
      ${supporter ? raw(html`<label class="set-row">${ic('crown')}<span class="set-txt"><b>Aparecer en la lista de Mecenas</b></span>
        <input type="checkbox" class="set-switch" data-opt="show_in_supporters" ${p.show_in_supporters ? 'checked' : ''}></label>`) : ''}
    </div>

    <p class="set-group">Apariencia</p>
    <div class="set-list">${raw(row('#/ajustes/apariencia', 'crystal-ball', 'Tema y tamaño de letra', `${theme} · letra ${size.toLowerCase()}`))}</div>

    <p class="set-group">Mis datos</p>
    <div class="set-list">
      ${raw(btnRow('data-export-all', 'scroll-unfurled', 'Descargar mis datos', 'JSON con toda tu colección'))}
      ${raw(row('#/ajustes/datos', 'skull-crossed-bones', 'Zona de peligro', 'Vaciar la biblioteca o eliminar la cuenta', 'danger'))}
    </div>

    <p class="set-group">Ayuda</p>
    <div class="set-list">
      ${raw(row('#/ayuda', 'compass', 'Ayuda y preguntas frecuentes'))}
      ${raw(btnRow('data-changelog', 'lantern-flame', 'Novedades', `Versión ${APP_VERSION}`))}
      ${raw(btnRow('data-update', 'torch', 'Buscar actualizaciones'))}
      ${settings.feedback_enabled
        ? raw(btnRow('data-feedback', 'fairy-wand', 'Enviar comentario o informar de un fallo'))
        : raw(html`<a class="set-row" href="${ISSUES_URL}" target="_blank" rel="noopener">${ic('fairy-wand')}<span class="set-txt"><b>Informar de un fallo o proponer una idea</b><small>En GitHub</small></span>${chev()}</a>`)}
      ${raw(btnRow('data-onboarding', 'treasure-map', 'Ver la bienvenida otra vez'))}
    </div>

    <div class="set-list set-logout"><button type="button" class="set-row" data-logout><span class="set-txt"><b>Cerrar sesión</b></span></button></div>

    <p class="muted small center pad">
      Escriba de la Marca v${APP_VERSION} · Hecho por <a href="https://github.com/Favashi" target="_blank" rel="noopener">Toni Ruiz (Favashi)</a> ·
      <a href="https://favashi.github.io/osr-manager/" target="_blank" rel="noopener">OSR Manager</a><br>
      Proyecto de fans, no oficial · Portadas © de sus autores, con permiso de La Marca del Este<br>
      Emblemas de <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (Lorc y Delapouite, CC BY 3.0)<br>
      <a href="privacidad.html">Privacidad</a> · <a href="https://github.com/Favashi/escribadelamarca" target="_blank" rel="noopener">Código</a></p>`;

  root.querySelectorAll('[data-opt]').forEach((el) => el.addEventListener('change', async () => {
    const field = el.dataset.opt;
    const on = el.checked;
    const list = field === 'show_in_scribes' ? 'Escribas' : 'Mecenas';
    el.disabled = true;
    try {
      await updateProfile(user().id, { [field]: on });
      state.profile[field] = on;
      toast(on ? `Tu nombre aparecerá en la lista de ${list}` : `Ya no apareces en la lista de ${list}`, 'ok');
    } catch (err) { el.checked = !on; toast(errMsg(err), 'error'); }
    el.disabled = false;
  }));
  $('[data-emblem]', root).onclick = async () => { if (await emblemDialog()) renderSettings(root); };
  $('[data-export-all]', root).onclick = () => downloadAllJson().catch((err) => toast(errMsg(err), 'error'));
  $('[data-changelog]', root).onclick = () => releaseNotesDialog();
  $('[data-update]', root).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const v = await checkForUpdate({ force: true });
    if (v) { toast(`Actualizando a la v${v}…`); setTimeout(reloadApp, 600); }
    else { toast('Ya tienes la última versión', 'ok'); btn.disabled = false; }
  };
  $('[data-feedback]', root)?.addEventListener('click', async () => {
    const res = await feedbackDialog();
    if (!res) return;
    try {
      await sendFeedback({ ...res, page: 'ajustes', app_version: APP_VERSION, user_agent: navigator.userAgent.slice(0, 300) });
      toast('¡Gracias! Tu comentario ha llegado', 'ok');
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  $('[data-onboarding]', root).onclick = async () => {
    const choice = await onboardingDialog();
    if (choice === 'scan') location.hash = '#/escanear';
    if (choice === 'catalog') location.hash = '#/catalogo';
    if (choice === 'help') location.hash = '#/ayuda';
  };
  $('[data-logout]', root).onclick = async () => { await signOut(); toast('Sesión cerrada'); };
}

// ---------- Secciones ----------
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>',
  parchment: '<span class="tp-glyph tp-uncial">Aa</span>',
  retro: '<span class="tp-glyph tp-mono">&gt;_</span>',
};

function themeOption(t, current, locked) {
  return html`<label class="theme-opt ${locked ? 'locked' : ''}">
    <input type="radio" name="theme" value="${t.id}" ${current === t.id ? 'checked' : ''} ${locked ? 'disabled' : ''}>
    <span class="theme-preview tp-${t.id}">${raw(THEME_ICONS[t.id] || '')}</span>
    <span class="theme-name">${locked ? raw(icon('lock', { label: 'Bloqueado' })) : ''}${t.label}</span>
  </label>`;
}

let achLoaded = false;

function renderSection(root, sec) {
  // Temas y títulos del perfil público dependen de los logros: si aún no se han cargado (se entra directo aquí), se cargan antes
  if (sec === 'perfil-publico' && !achLoaded && !state.achievements.length) {
    root.innerHTML = '<div class="loading" aria-busy="true">Cargando…</div>';
    getAchievements().then((rows) => { state.achievements = rows; }).catch(() => {})
      .finally(() => { achLoaded = true; if (root.isConnected) renderSection(root, sec); });
    return;
  }
  const p = state.profile ?? {};
  const supporter = isSupporter();
  const rerender = () => renderSection(root, sec);
  let body = '';
  if (sec === 'nombre') {
    body = html`<form class="panel form public-name-form">
      <label>Nombre público <input id="public-name" name="public_name" maxlength="30" autocomplete="nickname" value="${p.public_name ?? ''}"
        placeholder="${shortName(p.display_name)}"></label>
      <p class="muted small">Cómo te ven los demás en la Comunidad, en tu perfil público y en tu lista de deseos compartida. Si lo
        dejas vacío, se usa tu nombre de Google abreviado («${shortName(p.display_name)}»). Tu cuenta de Google no cambia.</p>
      <p class="muted small">Correo de tu cuenta: ${state.session.user.email}</p>
      <div class="actions"><button class="btn btn-primary">Guardar</button></div>
    </form>`;
  } else if (sec === 'perfil-publico') {
    body = html`<section class="panel">${raw(profileSettingsHtml())}</section>`;
  } else if (sec === 'apariencia') {
    const theme = getTheme();
    body = html`<section class="panel">
      <h2 class="setting-title">Tema</h2>
      <div class="theme-row" role="radiogroup" aria-label="Tema">${THEMES.filter((t) => !t.supporter).map((t) => raw(themeOption(t, theme, false)))}</div>
      <p class="theme-sub">Temas de Mecenas ${supporter ? '' : raw('<a href="#/mecenas">¿Cómo desbloquearlos?</a>')}</p>
      <div class="theme-row two" role="radiogroup" aria-label="Temas de Mecenas">${THEMES.filter((t) => t.supporter).map((t) => raw(themeOption(t, theme, !supporter)))}</div>
      <h2 class="setting-title">${raw(icon('text'))} Tamaño de letra</h2>
      <div class="seg text-seg" role="radiogroup" aria-label="Tamaño de letra">
        ${TEXT_SIZES.map((t) => raw(html`<label><input type="radio" name="text-size" value="${t.id}" ${getTextSize() === t.id ? 'checked' : ''}>
          <span><b style="font-size:${t.scale * 1.15}rem" aria-hidden="true">Aa</b>${t.label}</span></label>`))}
      </div>
    </section>`;
  } else if (sec === 'datos') {
    body = html`<section class="panel danger-zone">
      <div class="dz-item">
        <p class="small">Antes de borrar nada, puedes <strong>descargar una copia de todos tus datos</strong>.</p>
        <button class="btn btn-ghost btn-sm" data-export-all>${raw(icon('download'))} Descargar mis datos (JSON)</button>
      </div>
      <div class="dz-item">
        <h3>Empezar de cero</h3>
        <p class="muted small">Quita todos los libros de tu biblioteca y tu lista de deseos${supporter ? ' y tus préstamos' : ''}. El catálogo general no se toca.</p>
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
    </section>`;
  }
  root.innerHTML = html`<header class="set-top"><a class="set-back" href="#/ajustes" aria-label="Volver a Ajustes">${raw(icon('chevron', { cls: 'flip' }))}</a>
    <h1>${SECTIONS[sec]}</h1></header>${raw(body)}`;

  if (sec === 'nombre') {
    $('.public-name-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = e.target.elements.public_name.value.replace(/\s+/g, ' ').trim();
      if (value && value.length < 2) { toast('El nombre público necesita al menos 2 caracteres', 'error'); return; }
      try {
        await updateProfile(user().id, { public_name: value || null });
        state.profile.public_name = value || null;
        toast(value ? `Nombre público: ${value}` : 'Usarás tu nombre de Google abreviado', 'ok');
        rerender();
      } catch (err) { toast(errMsg(err), 'error'); }
    });
  }
  if (sec === 'perfil-publico') bindProfileSettings(root, rerender);
  if (sec === 'apariencia') {
    root.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => applyTheme(r.value, true)));
    root.querySelectorAll('input[name=text-size]').forEach((r) => r.addEventListener('change', () => applyTextSize(r.value, true)));
  }
  if (sec === 'datos') {
    $('[data-export-all]', root).onclick = () => downloadAllJson().catch((err) => toast(errMsg(err), 'error'));
    $('[data-reset]', root).onclick = async (e) => {
      const n = state.library.size;
      if (!(await confirmDialog(`¿Vaciar tu biblioteca? Se quitarán ${n} ${n === 1 ? 'libro' : 'libros'} con sus fechas de registro y notas. No se puede deshacer.`,
        { ok: 'Vaciar biblioteca', danger: true }))) return;
      e.target.disabled = true;
      try { await resetLibrary(user().id); await loadAll(); toast('Biblioteca vaciada', 'ok'); rerender(); }
      catch (err) { toast(errMsg(err), 'error'); e.target.disabled = false; }
    };
    $('[data-delete-account]', root).onclick = async (e) => {
      const email = state.session.user.email;
      if (!(await typeToConfirmDialog(`Se eliminarán la cuenta ${email}, los ${state.library.size} libros de tu biblioteca y todos tus datos. No se puede deshacer.`,
        { word: 'ELIMINAR', ok: 'Eliminar mi cuenta' }))) return;
      e.target.disabled = true;
      try {
        await deleteMyAccount();
        await signOut('local').catch(() => {});
        try { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('edm.deleted', '1'); } catch { /* sin storage */ }
        location.replace(location.pathname);
      } catch (err) { toast(errMsg(err), 'error'); e.target.disabled = false; }
    };
  }
}
