import { html, raw, $, fmtDate, fmtShort, toast } from '../util.js';
import { isAdmin, pendingCount, loadAll } from '../store.js';
import { viewHeader, confirmDialog, errMsg } from '../ui.js';
import * as api from '../api.js';
import { settings, saveSetting } from '../settings.js';
import { renderAnnouncement } from '../announcement.js';

const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Pestañas internas del área de administración (también las usa la vista de Revisión). */
export function adminTabs(active) {
  const n = pendingCount();
  const tabs = [
    ['resumen', '#/admin', 'Resumen'],
    ['revision', '#/revision', `Revisión${n ? ` (${n})` : ''}`],
    ['usuarios', '#/admin/usuarios', 'Usuarios'],
    ['donaciones', '#/admin/donaciones', 'Donaciones'],
    ['ajustes', '#/admin/ajustes', 'Ajustes'],
  ];
  return html`<nav class="admin-tabs" aria-label="Administración">${tabs.map(([id, href, label]) =>
    raw(html`<a href="${href}" class="${id === active ? 'active' : ''}" ${id === active ? raw('aria-current="page"') : ''}>${label}</a>`))}</nav>`;
}

function denied(root) {
  root.innerHTML = html`<div class="empty"><h2>Solo para administradores</h2><a class="btn btn-ghost" href="#/biblioteca">Volver</a></div>`;
}

/** Mini gráfica de barras semanal con los valores visibles (no depende solo del color). */
function weeklyChart(title, weekly, key) {
  const max = Math.max(1, ...weekly.map((w) => w[key]));
  const total = weekly.reduce((t, w) => t + w[key], 0);
  const label = `${title}: ${weekly.map((w) => `${fmtShort(w.week)} ${w[key]}`).join(', ')}`;
  return html`<figure class="wchart">
    <figcaption><span>${title}</span><strong>${total}</strong><small>8 semanas</small></figcaption>
    <div class="wchart-bars" role="img" aria-label="${label}">
      ${weekly.map((w) => raw(html`<div class="wchart-col" title="Semana del ${fmtShort(w.week)}: ${w[key]}">
        <span class="wchart-val">${w[key] || ''}</span>
        <span class="wchart-bar" style="height:${Math.round((w[key] / max) * 100)}%"></span>
      </div>`))}
    </div>
  </figure>`;
}

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
    else if (section === 'usuarios') await renderUsers(body);
    else if (section === 'donaciones') await renderDonations(body);
    else await renderSummary(body);
  } catch (e) {
    body.innerHTML = html`<div class="empty"><h2>No se pudieron cargar los datos</h2><p class="muted">${errMsg(e)}</p>
      <p class="muted small">¿Has aplicado la migración de métricas (<code>supabase db push</code>)?</p></div>`;
  }
}

async function renderSummary(body) {
  const m = await api.adminMetrics();
  const u = m.users, l = m.library, s = m.scans, c = m.catalog, d = m.donations;
  const weekly = m.weekly || [];
  const list = (rows, empty) => rows.length
    ? html`<ol class="toplist">${rows.map((r) => raw(html`<li><span>${r.code ? `${r.code} · ` : ''}${r.title}</span><strong>${r.n}</strong></li>`))}</ol>`
    : html`<p class="muted small">${empty}</p>`;

  body.innerHTML = html`
    <section class="kpis">
      ${raw(kpi(u.total, 'usuarios', `+${u.new_7d} esta semana`))}
      ${raw(kpi(u.active_7d, 'activos (7 días)', `${u.active_1d} hoy · ${u.active_30d} en 30 días`))}
      ${raw(kpi(u.supporters, 'mecenas', `${pct(u.supporters, u.total)} % de los usuarios`))}
      ${raw(kpi(eur(d.total), 'recaudado', `${d.count} donaciones${d.unmatched ? ` · ${d.unmatched} sin emparejar` : ''}`))}
      ${raw(kpi(l.entries, 'libros en bibliotecas', `+${l.added_7d} esta semana · ${u.with_books} usuarios con libros`))}
      ${raw(kpi(s.total_30d, 'escaneos (30 días)', `${pct(s.hit_30d, s.total_30d)} % reconocidos`))}
    </section>

    <section class="panel">
      <h2>Últimas 8 semanas</h2>
      <div class="wcharts">
        ${raw(weeklyChart('Altas', weekly, 'signups'))}
        ${raw(weeklyChart('Usuarios activos', weekly, 'active'))}
        ${raw(weeklyChart('Libros añadidos', weekly, 'added'))}
        ${raw(weeklyChart('Escaneos', weekly, 'scans'))}
      </div>
    </section>

    <div class="admin-cols">
      <section class="panel">
        <h2>Escaneos (30 días)</h2>
        <dl class="meta admin-meta">
          <dt>Reconocidos</dt><dd>${s.hit_30d}</dd>
          <dt>Varios libros</dt><dd>${s.multi_30d}</dd>
          <dt>Desconocidos</dt><dd>${s.unknown_30d}</dd>
          <dt>Búsquedas de aventuras</dt><dd>${s.searches_30d}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>Catálogo</h2>
        <dl class="meta admin-meta">
          <dt>Publicaciones</dt><dd>${c.books}</dd>
          <dt>Códigos verificados</dt><dd>${c.verified_codes}</dd>
          <dt>Códigos sin verificar</dt><dd>${c.unverified_codes}</dd>
          <dt>Pendientes de revisar</dt><dd>${c.pending_books + c.pending_codes} ${c.pending_books + c.pending_codes ? raw('<a href="#/revision">→</a>') : ''}</dd>
          <dt>Deseos · partidas</dt><dd>${l.wishes} · ${l.plays}</dd>
        </dl>
      </section>
    </div>

    <div class="admin-cols">
      <section class="panel"><h2>Más coleccionados</h2>${raw(list(m.top_owned || [], 'Aún no hay libros en bibliotecas.'))}</section>
      <section class="panel"><h2>Más deseados</h2>${raw(list(m.top_wished || [], 'Aún no hay listas de deseos.'))}</section>
    </div>
    <p class="muted small center">Datos a ${fmtDate(m.generated_at)}. Los eventos de uso se borran a los 12 meses.</p>`;
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
  ['donations_enabled', 'Donaciones y Mecenas', 'Muestra los botones de café y la invitación a hacerse Mecenas. Los Mecenas actuales conservan sus extras.'],
];

/** Admin → Ajustes: interruptores que cambian la app al instante, sin publicar versión. */
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
