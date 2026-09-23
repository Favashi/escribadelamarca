import { html, raw, $, toast } from '../util.js';
import { state, user, isSupporter, isAdmin, loadAll } from '../store.js';
import { signOut } from '../auth.js';
import { viewHeader, confirmDialog, errMsg, releaseNotesDialog } from '../ui.js';
import { APP_VERSION } from '../version.js';
import { resetLibrary } from '../api.js';
import { DONATION_URL } from '../config.js';
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
      <div>
        <h2>${p.display_name ?? email}</h2>
        <p class="muted small">${email}</p>
        <p>
          ${supporter ? raw('<span class="badge badge-gold">★ Mecenas</span>') : ''}
          ${isAdmin() ? raw('<span class="badge">Admin</span>') : ''}
        </p>
      </div>
    </section>

    <section class="panel coffee">
      <h2>¿Te es útil la app?</h2>
      <p>Escriba de la Marca es gratuita y se mantiene con aportaciones. Un café ayuda a pagar el servidor y seguir añadiendo mejoras.</p>
      <div class="actions">
        <a class="btn btn-ghost" href="#/mecenas">${supporter ? 'Mis extras de Mecenas' : 'Ventajas de Mecenas'}</a>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a>
      </div>
    </section>

    <section class="panel">
      <h2>Apariencia</h2>
      <div class="seg" role="radiogroup" aria-label="Tema">
        ${THEMES.map((t) => {
          const locked = t.supporter && !supporter;
          return raw(html`<label class="${locked ? 'locked' : ''}">
            <input type="radio" name="theme" value="${t.id}" ${theme === t.id ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span>${t.label}${locked ? ' 🔒' : ''}</span>
          </label>`);
        })}
      </div>
    </section>

    <section class="panel danger-zone">
      <h2>Empezar de cero</h2>
      <p class="muted small">Quita todos los libros de tu biblioteca${isSupporter() ? ', tu lista de deseos y tus préstamos' : ''}.
        El catálogo general no se toca.</p>
      <button class="btn btn-ghost btn-danger-text" data-reset ${state.library.size ? '' : 'disabled'}>Vaciar mi biblioteca (${state.library.size})</button>
    </section>

    <button class="btn btn-ghost btn-block" data-logout>Cerrar sesión</button>
    <p class="muted small center pad">Escriba de la Marca <button class="link" data-changelog>v${APP_VERSION} · Novedades</button><br>
      Hecho por <a href="https://github.com/Favashi" target="_blank" rel="noopener">Toni Ruiz (Favashi)</a> ·
      <a href="https://favashi.github.io/osr-manager/" target="_blank" rel="noopener">OSR Manager</a><br>
      Proyecto de fans, no oficial · <a href="privacidad.html">Privacidad</a> ·
      <a href="https://github.com/Favashi/escribadelamarca" target="_blank" rel="noopener">Código</a></p>`;

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

  $('[data-changelog]', root).onclick = () => releaseNotesDialog();

  $('[data-logout]', root).onclick = async () => { await signOut(); toast('Sesión cerrada'); };
}
