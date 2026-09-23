import { html, raw, $, cover, fmtDate, fmtShort, toast, download } from '../util.js';
import { state, user, isSupporter, groupByCategory, bookById, categoryName, barcodesOf, compareBooks, loadAll } from '../store.js';
import { viewHeader } from '../ui.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from '../config.js';
import * as api from '../api.js';

const PERKS = [
  ['★', 'Insignia de Mecenas', 'En tu perfil, para que se vea que apoyas el proyecto.'],
  ['☆', 'Lista de deseos', 'Marca los libros que te faltan y quieres conseguir.'],
  ['⇄', 'Registro de préstamos', 'Apunta a quién prestas cada libro y cuándo vuelve.'],
  ['▤', 'Estadísticas', 'Porcentaje de colección completa, por categoría.'],
  ['⤓', 'Exportar biblioteca', 'Descarga tu colección en CSV o JSON cuando quieras.'],
  ['❦', 'Tema Pergamino', 'Un aspecto extra con sabor a viejo manuscrito.'],
];

export async function renderSupporter(root) {
  if (!isSupporter()) return renderPitch(root);

  const uid = user().id;
  let loans = [];
  try { loans = await api.getLoans(uid); } catch { /* RLS */ }
  const active = loans.filter((l) => !l.returned_at);
  const approved = state.catalog.filter((b) => b.status === 'approved');
  const ownedApproved = approved.filter((b) => state.library.has(b.id));
  const pct = approved.length ? Math.round((ownedApproved.length / approved.length) * 100) : 0;
  const wishes = [...state.wishlist].map(bookById).filter(Boolean);

  root.innerHTML = html`
    ${raw(viewHeader('Mecenas', `Gracias por apoyar el proyecto desde el ${fmtDate(state.profile.supporter_since) || 'principio'} ✦`))}

    <section class="panel">
      <h2>Tu colección</h2>
      <div class="big-stat"><span>${pct}%</span><small>${ownedApproved.length} de ${approved.length} libros del catálogo</small></div>
      <ul class="bars">
        ${groupByCategory(approved).filter((g) => g.books.length).map((g) => {
          const have = g.books.filter((b) => state.library.has(b.id)).length;
          const p = Math.round((have / g.books.length) * 100);
          return raw(html`<li><span class="bar-label">${g.category.name}</span>
            <span class="bar" role="img" aria-label="${have} de ${g.books.length}"><span style="width:${p}%"></span></span>
            <span class="bar-val">${have}/${g.books.length}</span></li>`);
        })}
      </ul>
    </section>

    <section class="panel">
      <h2>Lista de deseos</h2>
      ${wishes.length ? raw(html`<ul class="rows">${wishes.map((b) => raw(html`<li class="row">${raw(cover(b, 'cover-xs'))}<a class="row-title" href="#/libro/${b.id}">${b.title}<small>${categoryName(b.category_id)}</small></a></li>`))}</ul>`)
        : raw('<p class="muted">Vacía. Abre un libro que te falte y pulsa «☆ Lo quiero».</p>')}
    </section>

    <section class="panel">
      <h2>Prestados ahora</h2>
      ${active.length ? raw(html`<ul class="rows">${active.map((l) => {
        const b = bookById(l.catalog_id);
        return raw(html`<li class="row"><a class="row-title" href="#/libro/${l.catalog_id}">${b?.title ?? '—'}<small>A ${l.lent_to} desde el ${fmtShort(l.lent_at)}</small></a></li>`);
      })}</ul>`) : raw('<p class="muted">Ningún libro prestado.</p>')}
    </section>

    <section class="panel">
      <h2>Exportar</h2>
      <div class="actions">
        <button class="btn btn-ghost" data-csv>Descargar CSV</button>
        <button class="btn btn-ghost" data-json>Descargar JSON</button>
      </div>
    </section>

    <section class="panel coffee">
      <p>¿Quieres volver a invitar a un café? Siempre se agradece.</p>
      <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Invítame a un café</a>
    </section>`;

  const rows = () => [...state.library.values()]
    .map((e) => ({ e, b: bookById(e.catalog_id) ?? { title: '' } }))
    .sort((x, y) => categoryName(x.b.category_id).localeCompare(categoryName(y.b.category_id), 'es') || compareBooks(x.b, y.b))
    .map(({ e, b }) => ({
      codigo: b.code ?? '', titulo: b.title, categoria: categoryName(b.category_id), autor: b.author ?? '',
      codigos_barras: barcodesOf(b.id).filter((c) => c.status === 'approved').map((c) => c.code).join(' '),
      registrado: e.added_at, estado: e.condition ?? '', notas: e.notes ?? '',
    }));

  const stamp = new Date().toISOString().slice(0, 10);
  $('[data-json]', root).onclick = () =>
    download(`biblioteca-marca-${stamp}.json`, JSON.stringify(rows(), null, 2), 'application/json');
  $('[data-csv]', root).onclick = () => {
    const data = rows();
    const cols = Object.keys(data[0] ?? { titulo: '' });
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [cols.join(';'), ...data.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n');
    download(`biblioteca-marca-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
  };
}

function renderPitch(root) {
  const email = user().email;
  root.innerHTML = html`
    ${raw(viewHeader('Hazte Mecenas', 'La app es y seguirá siendo gratuita. Si quieres apoyarla, llévate unos extras.'))}

    <section class="panel">
      <ul class="perks">
        ${PERKS.map(([icon, t, d]) => raw(html`<li><span class="perk-icon" aria-hidden="true">${icon}</span><div><strong>${t}</strong><p class="muted small">${d}</p></div></li>`))}
      </ul>
    </section>

    <section class="panel">
      <h2>Cómo activarlo</h2>
      <ol class="steps">
        <li>Invita a un café de <strong>${SUPPORTER_MIN_AMOUNT} € o más</strong> en Buy Me a Coffee (pago único, para siempre).</li>
        <li>Paga con el mismo email de tu cuenta de Google, <strong>o escribe este email en el mensaje</strong>:
          <code class="copy" tabindex="0" title="Toca para copiar">${email}</code></li>
        <li>Se activa solo en unos segundos. Pulsa «Ya he donado» para comprobarlo.</li>
      </ol>
      <div class="actions">
        <button class="btn btn-ghost" data-check>Ya he donado</button>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">☕ Ir a Buy Me a Coffee</a>
      </div>
    </section>`;

  $('.copy', root).onclick = async () => {
    try { await navigator.clipboard.writeText(email); toast('Email copiado', 'ok'); } catch { /* sin portapapeles */ }
  };
  $('[data-check]', root).onclick = async (e) => {
    e.target.disabled = true;
    await loadAll();
    if (isSupporter()) { toast('¡Gracias! Ya eres Mecenas ★', 'ok'); renderSupporter(root); }
    else { toast('Aún no nos ha llegado. Si pasa un rato, escríbenos con tu recibo de Buy Me a Coffee.'); e.target.disabled = false; }
  };
}
