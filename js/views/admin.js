import { html, raw, $, fmtDate, fmtShort, toast } from '../util.js';
import { icon } from '../icons.js';
import { uploadCover, matchFiles, deleteAllCovers } from '../covers.js';
import { renderStats } from './admin-stats.js';
import { state, isAdmin, pendingCount, loadAll, personName, compareBooks, bookById, refreshCatalog } from '../store.js';
import { updateAdminBadge } from '../nav.js';
import { viewHeader, confirmDialog, errMsg, typeToConfirmDialog } from '../ui.js';
import * as api from '../api.js';
import { settings, saveSetting } from '../settings.js';
import { SUPABASE_URL } from '../config.js';
import { renderAnnouncement } from '../announcement.js';

const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Pestañas internas del área de administración (también las usa la vista de Revisión). */
export function adminTabs(active) {
  const pending = pendingCount();
  const newFeedback = state.feedback.filter((f) => f.status === 'new').length;
  const tabs = [
    ['resumen', '#/admin', 'Resumen'],
    ['estadisticas', '#/admin/estadisticas', 'Estadísticas'],
    ['revision', '#/revision', 'Revisión', pending],
    ['usuarios', '#/admin/usuarios', 'Usuarios'],
    ['donaciones', '#/admin/donaciones', 'Donaciones'],
    ['comentarios', '#/admin/comentarios', 'Comentarios', newFeedback],
    ['portadas', '#/admin/portadas', 'Portadas'],
    ['ajustes', '#/admin/ajustes', 'Ajustes'],
  ];
  // Los contadores van en una burbuja (no «(3)» en el texto) para que quepan en la rejilla del móvil
  return html`<nav class="admin-tabs" aria-label="Administración">${tabs.map(([id, href, label, n]) =>
    raw(html`<a href="${href}" class="${id === active ? 'active' : ''}" ${id === active ? raw('aria-current="page"') : ''}
      ${n ? raw(html`aria-label="${label}, ${n} pendientes"`) : ''}>${label}${n ? raw(html`<b class="tab-count" aria-hidden="true">${n > 99 ? '99+' : n}</b>`) : ''}</a>`))}</nav>`;
}

function denied(root) {
  root.innerHTML = html`<div class="empty"><h2>Solo para administradores</h2><a class="btn btn-ghost" href="#/biblioteca">Volver</a></div>`;
}

/** Mini gráfica de barras semanal con los valores visibles (no depende solo del color). */

/** f•••@gmail.com */
export const maskEmail = (email) => {
  const [user, domain] = String(email ?? '').split('@');
  return domain ? `${user.slice(0, 1)}•••@${domain}` : '—';
};

const kpi = (value, label, sub = '') => html`<div class="kpi"><span>${value}</span><small>${label}</small>${sub ? raw(html`<em>${sub}</em>`) : ''}</div>`;

export async function renderAdmin(root, params = {}) {
  if (!isAdmin()) return denied(root);
  const section = params.section || 'resumen';
  root.innerHTML = html`${raw(viewHeader('Administración'))}${raw(adminTabs(section))}<div class="admin-body"><div class="loading" aria-busy="true">Cargando…</div></div>`;
  const body = $('.admin-body', root);
  try {
    if (section === 'ajustes') renderSettings(body);
    else if (section === 'estadisticas') await renderStats(body);
    else if (section === 'portadas') renderCovers(body);
    else if (section === 'comentarios') await renderFeedback(body);
    else if (section === 'usuarios') await renderUsers(body);
    else if (section === 'donaciones') await renderDonations(body);
    else await renderSummary(body);
  } catch (e) {
    body.innerHTML = html`<div class="empty"><h2>No se pudieron cargar los datos</h2><p class="muted">${errMsg(e)}</p>
      <p class="muted small">¿Has aplicado la migración de métricas (<code>supabase db push</code>)?</p></div>`;
  }
}

/** Supabase → Table Editor del proyecto (errores y avisos se consultan ahí). */
const TABLE_EDITOR = `https://supabase.com/dashboard/project/${(SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./) || [])[1]}/editor`;

/**
 * Resumen: lo que hay que atender (cada pendiente con su enlace) y cuatro cifras clave.
 * El análisis (gráficas, canales, retención, top) está en Estadísticas.
 */
async function renderSummary(body) {
  // La parte de salud es opcional: si falla (migración sin aplicar, versión mezclada en caché), el Resumen sale sin ella
  const [m, ov] = await Promise.all([api.adminMetrics(), (async () => api.adminOverview())().catch(() => null)]);
  const u = m.users, d = m.donations;
  const approved = state.catalog.filter((b) => b.status === 'approved');
  const booksPerCode = new Map();
  for (const bc of state.barcodes) booksPerCode.set(bc.code, (booksPerCode.get(bc.code) || 0) + 1);
  const dupCodes = [...booksPerCode.values()].filter((n) => n > 1).length;
  const unverifiedBooks = new Set(state.barcodes.filter((b) => b.status === 'approved' && !b.verified).map((b) => b.catalog_id)).size;
  const n = (x, one, many) => `${x} ${x === 1 ? one : many}`;
  const pending = {
    books: state.catalog.filter((b) => b.status === 'pending').length,
    codes: state.barcodes.filter((b) => b.status === 'pending').length,
    suggestions: state.suggestions.filter((x) => x.status === 'pending').length,
  };
  const review = pending.books + pending.codes + pending.suggestions;
  const dbPct = ov ? Math.round((ov.db_mb / ov.db_limit_mb) * 100) : 0;

  // [icono, texto, detalle, enlace, externo?] — solo los que tienen algo
  const todos = [
    review && ['quill', `${n(review, 'propuesta', 'propuestas')} por revisar`,
      [pending.books && n(pending.books, 'libro', 'libros'), pending.codes && n(pending.codes, 'código', 'códigos'),
        pending.suggestions && n(pending.suggestions, 'sugerencia', 'sugerencias')].filter(Boolean).join(' · '), '#/revision'],
    state.feedback.filter((f) => f.status === 'new').length && ['chat',
      n(state.feedback.filter((f) => f.status === 'new').length, 'comentario nuevo', 'comentarios nuevos'), '', '#/admin/comentarios'],
    d.unmatched && ['coffee', n(d.unmatched, 'donación sin emparejar', 'donaciones sin emparejar'), 'Asígnalas a su usuario', '#/admin/donaciones'],
    approved.filter((b) => !b.cover_url).length && ['camera',
      n(approved.filter((b) => !b.cover_url).length, 'libro sin portada', 'libros sin portada'), '', '#/admin/portadas'],
    dupCodes && ['warning', n(dupCodes, 'código de barras duplicado', 'códigos de barras duplicados'), 'Un mismo EAN en varios libros', '#/catalogo/duplicates'],
    unverifiedBooks && ['shield', n(unverifiedBooks, 'libro con código sin verificar', 'libros con códigos sin verificar'),
      'Se verifican escaneando el ejemplar (modo «verificar estantería»)', '#/catalogo/unverified'],
    ov?.errors_7d && ['bug', `${n(ov.errors_7d, 'error', 'errores')} en la app (7 días)`, n(ov.error_kinds_7d, 'error distinto', 'errores distintos'),
      TABLE_EDITOR, true],
    ov?.notify_failed_7d && ['warning', `${n(ov.notify_failed_7d, 'aviso', 'avisos')} de Telegram sin entregar (7 días)`,
      'Tabla admin_notifications', TABLE_EDITOR, true],
    dbPct >= 80 && ['warning', `Base de datos al ${dbPct} % del límite`, `${ov.db_mb} MB de ${ov.db_limit_mb} MB`, TABLE_EDITOR, true],
  ].filter(Boolean);

  body.innerHTML = html`
    <section class="panel todo-panel">
      <h2>Pendiente</h2>
      ${todos.length ? raw(html`<ul class="todo-list">${todos.map(([ic, title, sub, href, ext]) => raw(html`<li>
        <a href="${href}" ${ext ? raw('target="_blank" rel="noopener"') : ''}>
          <span class="todo-icon" aria-hidden="true">${raw(icon(ic))}</span>
          <span class="todo-text"><strong>${title}</strong>${sub ? raw(html`<small>${sub}</small>`) : ''}</span>
          ${raw(icon('chevron', { cls: 'todo-go' }))}
        </a></li>`))}</ul>`)
        : raw(html`<p class="todo-done">${raw(icon('seal'))} Todo al día. No hay nada pendiente.</p>`)}
    </section>

    <section class="kpis four">
      ${raw(kpi(u.total, 'usuarios', `+${u.new_7d} esta semana`))}
      ${raw(kpi(u.active_7d, 'activos (7 días)', `${u.active_1d} hoy`))}
      ${raw(kpi(u.supporters, 'mecenas', `${pct(u.supporters, u.total)} % de los usuarios`))}
      ${raw(kpi(eur(d.total), 'recaudado', `${d.count} donaciones`))}
    </section>
    <p class="center"><a class="btn btn-ghost btn-sm" href="#/admin/estadisticas">Ver estadísticas ${raw(icon('chevron'))}</a></p>`;
}

async function renderUsers(body) {
  const users = await api.adminUsers();
  let q = '';
  body.innerHTML = html`
    <p class="muted small">Los emails se muestran ocultos; púlsalos solo cuando necesites verlos (p. ej. para emparejar una donación).</p>
    <div class="toolbar"><input type="search" class="search" placeholder="Buscar por nombre o email…" aria-label="Buscar usuario">
      <span class="muted small">${users.length} usuarios · ${users.filter((u) => u.is_supporter).length} mecenas</span></div>
    <ul class="user-list"></ul>`;
  const list = $('.user-list', body);

  function draw() {
    const n = q.toLowerCase();
    const rows = users.filter((u) => !n || `${u.display_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(n));
    list.innerHTML = rows.map((u) => html`<li class="user-row" data-user="${u.id}">
      <div class="user-info">
        <strong>${u.display_name || maskEmail(u.email)}</strong>
        ${u.is_supporter ? raw('<span class="badge badge-gold">★ Mecenas</span>') : ''}
        ${u.is_admin ? raw('<span class="badge">Admin</span>') : ''}
        <small><button class="link email-mask" data-reveal="${u.email}" aria-label="Mostrar email">${maskEmail(u.email)}</button></small>
        <small>Alta ${fmtShort(u.created_at)} · última apertura ${u.last_open ? fmtShort(u.last_open) : '—'}</small>
        <small>${u.books} libros · ${u.wishes} deseos · ${u.plays} partidas${Number(u.donated) ? ` · donado ${eur(u.donated)}` : ''}</small>
      </div>
      <button class="btn btn-sm ${u.is_supporter ? 'btn-ghost btn-danger-text' : 'btn-ghost'}" data-toggle>${u.is_supporter ? 'Quitar Mecenas' : 'Hacer Mecenas'}</button>
    </li>`).join('') || html`<li class="muted pad">Sin resultados.</li>`;
  }

  $('.search', body).addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
  list.addEventListener('click', async (e) => {
    const reveal = e.target.closest('[data-reveal]');
    if (reveal) { reveal.textContent = reveal.dataset.reveal; reveal.removeAttribute('data-reveal'); return; }
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const u = users.find((x) => x.id === btn.closest('[data-user]').dataset.user);
    const value = !u.is_supporter;
    const ok = await confirmDialog(value
      ? `¿Hacer Mecenas a ${u.display_name || maskEmail(u.email)}? Desbloqueará todos los extras.`
      : `¿Quitar Mecenas a ${u.display_name || maskEmail(u.email)}? Perderá el acceso a los extras (sus datos se conservan).`,
    { ok: value ? 'Hacer Mecenas' : 'Quitar Mecenas', danger: !value });
    if (!ok) return;
    try {
      await api.adminSetSupporter(u.id, value);
      u.is_supporter = value;
      toast(value ? 'Ahora es Mecenas' : 'Mecenas retirado', 'ok');
      await loadAll(); // por si el usuario eres tú
      draw();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  draw();
}

async function renderDonations(body) {
  const [donations, users] = await Promise.all([api.adminDonations(), api.adminUsers()]);
  const unmatched = donations.filter((d) => !d.matched && d.live_mode !== false);
  const row = (d) => html`<li class="donation-row ${d.matched ? '' : 'unmatched'}" data-donation="${d.id}">
    <div class="user-info">
      <strong>${eur(d.amount)}${d.currency && d.currency !== 'EUR' ? ` (${d.currency})` : ''}</strong>
      ${d.live_mode === false ? raw('<span class="badge">prueba</span>') : ''}
      ${d.matched ? raw('<span class="badge badge-ok">emparejada</span>') : raw('<span class="badge badge-warn">sin emparejar</span>')}
      <small>${fmtDate(d.created_at)} · ${d.type || d.provider} ·
        ${d.email ? raw(html`<button class="link email-mask" data-reveal="${d.email}" aria-label="Mostrar email">${maskEmail(d.email)}</button>`) : 'sin email'}</small>
    </div>
    ${!d.matched && d.live_mode !== false ? raw(html`<div class="inline-form match-form">
      <select aria-label="Usuario al que asignar la donación"><option value="">Asignar a…</option>
        ${users.map((u) => raw(html`<option value="${u.id}">${u.display_name || '—'} · ${maskEmail(u.email)}</option>`))}</select>
      <button class="btn btn-sm btn-primary" data-match>Asignar</button>
    </div>`) : ''}
  </li>`;

  body.innerHTML = html`
    ${unmatched.length ? raw(html`<section class="panel pending"><h2>Sin emparejar <span class="count">${unmatched.length}</span></h2>
      <p class="muted small">El email del pago no coincide con ninguna cuenta. Asígnala al usuario correcto y quedará como Mecenas.</p>
      <ul class="user-list">${unmatched.map((d) => raw(row(d)))}</ul></section>`) : ''}
    <section class="panel">
      <h2>Todas las donaciones</h2>
      ${donations.length ? raw(html`<ul class="user-list">${donations.map((d) => raw(row(d)))}</ul>`)
        : raw('<p class="muted">Aún no ha llegado ninguna donación. Los eventos de prueba de Buy Me a Coffee también aparecerán aquí.</p>')}
    </section>`;

  body.onclick = async (e) => {   // asignación (no addEventListener: se re-renderiza en el mismo nodo)
    const reveal = e.target.closest('[data-reveal]');
    if (reveal) { reveal.textContent = reveal.dataset.reveal; reveal.removeAttribute('data-reveal'); return; }
    const btn = e.target.closest('[data-match]');
    if (!btn) return;
    const li = btn.closest('[data-donation]');
    const userId = $('select', li).value;
    if (!userId) { toast('Elige un usuario', 'error'); return; }
    try {
      await api.adminMatchDonation(Number(li.dataset.donation), userId);
      toast('Donación asignada: el usuario ya es Mecenas', 'ok');
      await renderDonations(body);
    } catch (err) { toast(errMsg(err), 'error'); }
  };
}

const FLAGS = [
  ['covers_enabled', 'Portadas', 'Muestra las portadas de los libros. Desactivado, todos ven las mini-portadas con iniciales. (Ocultarlas no las borra del almacenamiento.)'],
  ['suggestions_enabled', 'Sugerencias de cambios', 'Permite a los usuarios proponer correcciones. Desactivado, el botón desaparece y la base de datos rechaza sugerencias nuevas.'],
  ['feedback_enabled', 'Comentarios desde la app', 'Los usuarios envían fallos e ideas con un formulario que te llega por Telegram. Desactivado, el botón enlaza a los issues de GitHub y la base de datos rechaza comentarios nuevos.'],
  ['donations_enabled', 'Donaciones y Mecenas', 'Muestra los botones de café y la invitación a hacerse Mecenas. Los Mecenas actuales conservan sus extras.'],
];

/** Admin → Ajustes: interruptores que cambian la app al instante, sin publicar versión. */
/** Portadas: recuento, libros sin portada, subida masiva (ficheros con el código en el nombre) y borrado de emergencia. */
function renderCovers(body) {
  const books = state.catalog.filter((b) => b.status === 'approved').sort(compareBooks);
  const withCover = books.filter((b) => b.cover_url);
  const missing = books.filter((b) => !b.cover_url);
  let rows = [];

  body.innerHTML = html`
    <section class="panel">
      <h2>Portadas</h2>
      <p class="big-stat"><span>${withCover.length}</span><small>de ${books.length} libros tienen portada</small></p>
      <p class="muted small">Se guardan en Supabase Storage (bucket público «covers»), nunca en el repositorio, reducidas a
        unos 400 px y comprimidas en este dispositivo antes de subirlas. Portadas © de sus autores, usadas con permiso de
        La Marca del Este. Para ocultarlas al momento: Ajustes → Portadas.</p>
      ${settings.covers_enabled ? '' : raw('<p class="badge badge-warn">Las portadas están ocultas (Ajustes → Portadas)</p>')}
      ${missing.length ? raw(html`<details class="missing-covers"><summary>Sin portada (${missing.length})</summary>
        <p class="small">${missing.map((b) => b.code || b.title).join(', ')}</p></details>`) : ''}
    </section>

    <section class="panel">
      <h2>Subir varias</h2>
      <p class="muted small">Nombra cada fichero con el código del libro: <code>B12.jpg</code>, <code>X2.png</code>,
        <code>CR - Caja Roja.webp</code>… Revisa la lista y pulsa «Subir». Si el libro ya tenía portada, se sustituye.</p>
      <label class="btn btn-primary">Elegir imágenes<input type="file" accept="image/*" multiple data-bulk hidden></label>
      <div class="bulk-list"></div>
    </section>

    <details class="panel danger-zone">
      <summary><h2>${raw(icon('warning'))} Borrar todas las portadas</h2><span class="muted small">Por si se retira el permiso</span>${raw(icon('chevron', { cls: 'dz-chevron' }))}</summary>
      <div class="dz-item">
        <p class="small">Borra todos los ficheros del bucket y deja todos los libros sin portada. Para solo ocultarlas, usa
          Ajustes → Portadas.</p>
        <button class="btn btn-danger-outline" data-delete-covers>${raw(icon('trash'))} Borrar todas las portadas</button>
      </div>
    </details>`;

  const list = $('.bulk-list', body);
  const draw = () => {
    const ok = rows.filter((r) => r.book && !r.done);
    list.innerHTML = rows.length ? html`
      <ul class="rows bulk-rows">${rows.map((r, i) => raw(html`<li class="row ${r.done ? 'bulk-done' : ''}">
        <span class="row-title">${r.file.name}
          <small>${r.error ? raw(html`<span class="bad">${r.error}</span>`)
            : r.done ? '✓ Subida'
            : r.book ? raw(html`→ <strong>${r.book.code}</strong> · ${r.book.title}${r.book.cover_url ? ' (sustituye la actual)' : ''}`)
            : r.books.length > 1 ? raw(html`<select data-pick="${i}"><option value="">¿Cuál de ${r.books.length}?</option>
                ${r.books.map((b) => raw(html`<option value="${b.id}">${b.title}</option>`))}</select>`)
            : raw(html`<span class="bad">Ningún libro con el código «${r.code || '?'}»</span>`)}</small></span>
      </li>`))}</ul>
      <div class="actions"><button class="btn btn-primary" data-bulk-go ${ok.length ? '' : 'disabled'}>Subir ${ok.length} ${ok.length === 1 ? 'portada' : 'portadas'}</button></div>`
      : '';
  };

  $('[data-bulk]', body).addEventListener('change', (e) => {
    rows = matchFiles(e.target.files).map((m) => ({ ...m, book: m.books.length === 1 ? m.books[0] : null }));
    e.target.value = '';
    draw();
  });
  list.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-pick]');
    if (!sel) return;
    const r = rows[Number(sel.dataset.pick)];
    r.book = r.books.find((b) => b.id === sel.value) || null;
    draw();
  });
  list.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-bulk-go]');
    if (!go) return;
    go.disabled = true;
    const todo = rows.filter((r) => r.book && !r.done);
    let n = 0;
    for (const r of todo) {
      go.textContent = `Subiendo ${++n} de ${todo.length}…`;
      try {
        await uploadCover(bookById(r.book.id) || r.book, r.file);
        r.done = true;
      } catch (err) { r.error = errMsg(err); }
    }
    await refreshCatalog();
    const done = todo.filter((r) => r.done).length;
    toast(`${done} ${done === 1 ? 'portada subida' : 'portadas subidas'}${done < todo.length ? ` · ${todo.length - done} con error` : ''}`, done === todo.length ? 'ok' : 'error');
    renderCovers(body);
  });

  $('[data-delete-covers]', body).onclick = async (e) => {
    const ok = await typeToConfirmDialog(`Se borrarán las ${withCover.length} portadas y sus ficheros. No se puede deshacer.`,
      { word: 'PORTADAS', ok: 'Borrar todas' });
    if (!ok) return;
    e.target.disabled = true;
    try {
      const n = await deleteAllCovers();
      await refreshCatalog();
      toast(`${n} ficheros borrados; ningún libro tiene portada`, 'ok');
      renderCovers(body);
    } catch (err) { toast(errMsg(err), 'error'); e.target.disabled = false; }
  };
}

function renderSettings(body) {
  const a = settings.announcement || { enabled: false, text: '', level: 'info' };
  body.innerHTML = html`
    <p class="muted small">Los cambios se aplican al momento para quien abra o recargue la app.</p>
    <section class="panel">
      <h2>Funciones</h2>
      <ul class="flag-list">${FLAGS.map(([key, title, desc]) => raw(html`<li class="flag-row">
        <div><strong>${title}</strong><small>${desc}</small></div>
        <label class="flag-switch"><input type="checkbox" data-flag="${key}" ${settings[key] ? 'checked' : ''}>
          <span aria-hidden="true"></span><span class="sr-only">${title}</span></label>
      </li>`))}</ul>
    </section>

    <section class="panel">
      <h2>Aviso general</h2>
      <p class="muted small">Una franja arriba de la app para todos (también en la portada). Cada usuario puede cerrarla;
        vuelve a salir si cambias el texto.</p>
      <form class="form announcement-form">
        <label class="switch"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> <span>Mostrar el aviso</span></label>
        <label>Texto <textarea name="text" rows="2" maxlength="240" placeholder="Mantenimiento el domingo de 18 a 19 h…">${a.text || ''}</textarea></label>
        <label>Tipo
          <select name="level">
            <option value="info" ${a.level === 'info' ? 'selected' : ''}>Información</option>
            <option value="ok" ${a.level === 'ok' ? 'selected' : ''}>Buena noticia</option>
            <option value="warn" ${a.level === 'warn' ? 'selected' : ''}>Aviso importante</option>
          </select>
        </label>
        <div class="actions"><button class="btn btn-primary">Guardar aviso</button></div>
      </form>
    </section>`;

  body.querySelectorAll('[data-flag]').forEach((input) => input.addEventListener('change', async () => {
    const key = input.dataset.flag;
    input.disabled = true;
    try {
      await saveSetting(key, input.checked);
      toast(`${FLAGS.find((f) => f[0] === key)[1]}: ${input.checked ? 'activado' : 'desactivado'}`, 'ok');
    } catch (err) { input.checked = !input.checked; toast(errMsg(err), 'error'); }
    input.disabled = false;
  }));

  $('.announcement-form', body).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const value = { enabled: f.get('enabled') === 'on', text: f.get('text').trim(), level: f.get('level') };
    if (value.enabled && !value.text) { toast('Escribe el texto del aviso', 'error'); return; }
    try {
      await saveSetting('announcement', value);
      renderAnnouncement();
      toast(value.enabled ? 'Aviso publicado' : 'Aviso retirado', 'ok');
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

const KIND = { fallo: `${icon('bug')} Fallo`, idea: `${icon('bulb')} Idea`, otro: `${icon('chat')} Otro` };
const FB_STATUS = { new: 'Nuevo', read: 'Leído', done: 'Resuelto' };

/** Comentarios de los usuarios: nuevos primero; marcar como leído / resuelto o borrar. */
async function renderFeedback(body) {
  state.feedback = await api.getFeedback();
  const device = (ua = '') => (/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'otro');
  const draw = () => {
    const rows = [...state.feedback].sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1)
      || String(b.created_at).localeCompare(String(a.created_at)));
    body.innerHTML = rows.length ? html`<ul class="user-list">${rows.map((f) => raw(html`<li class="feedback-row fb-${f.status}" data-fb="${f.id}">
      <div class="user-info">
        <strong>${KIND[f.kind] ? raw(KIND[f.kind]) : f.kind} <span class="badge ${f.status === 'new' ? 'badge-warn' : ''}">${FB_STATUS[f.status]}</span></strong>
        <p class="fb-message">${f.message}</p>
        <small>${f.user_id ? personName(f.user_id) : 'usuario borrado'} · ${fmtDate(f.created_at)} · v${f.app_version || '?'} · ${device(f.user_agent)}</small>
      </div>
      <div class="review-actions">
        ${f.status !== 'read' && f.status !== 'done' ? raw('<button class="btn btn-sm btn-ghost" data-fb-status="read">Leído</button>') : ''}
        ${f.status !== 'done' ? raw('<button class="btn btn-sm btn-primary" data-fb-status="done">Resuelto</button>') : ''}
        <button class="btn btn-sm btn-ghost btn-danger-text" data-fb-del>Borrar</button>
      </div>
    </li>`))}</ul>` : html`<p class="muted">Aún no ha llegado ningún comentario.</p>`;
  };
  body.onclick = async (e) => {
    const row = e.target.closest('[data-fb]');
    if (!row) return;
    const id = Number(row.dataset.fb);
    try {
      const st = e.target.closest('[data-fb-status]')?.dataset.fbStatus;
      if (st) await api.setFeedbackStatus(id, st);
      else if (e.target.closest('[data-fb-del]')) {
        if (!(await confirmDialog('¿Borrar este comentario?', { ok: 'Borrar', danger: true }))) return;
        await api.deleteFeedback(id);
      } else return;
      state.feedback = await api.getFeedback();
      updateAdminBadge();
      draw();
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  draw();
}
