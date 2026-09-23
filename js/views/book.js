import { html, raw, $, cover, fmtDate, fmtShort, toast } from '../util.js';
import { state, user, isAdmin, isSupporter, bookById, categoryName, barcodesOf, personName, refreshCatalog, refreshLibrary } from '../store.js';
import { bookFormDialog, confirmDialog, errMsg, CONDITIONS } from '../ui.js';
import { formatCode, normalizeCode } from '../isbn.js';
import { navigate } from '../router.js';
import * as api from '../api.js';

export async function renderBook(root, { id }) {
  const book = bookById(id);
  if (!book) {
    root.innerHTML = html`<div class="empty"><h2>Libro no encontrado</h2><a class="btn btn-ghost" href="#/catalogo">Ir al catálogo</a></div>`;
    return;
  }
  const uid = user().id;
  const entry = state.library.get(book.id);
  const supporter = isSupporter();
  const admin = isAdmin();
  let loans = [];
  if (supporter) {
    try { loans = (await api.getLoans(uid)).filter((l) => l.catalog_id === book.id); } catch { /* RLS */ }
  }
  const activeLoan = loans.find((l) => !l.returned_at);
  const wished = state.wishlist.has(book.id);
  const codes = barcodesOf(book.id);

  root.innerHTML = html`
    <button class="back" onclick="history.length > 1 ? history.back() : (location.hash = '#/biblioteca')">← Volver</button>
    <article class="book">
      ${raw(cover(book, 'cover-lg'))}
      <div class="book-info">
        <p class="eyebrow">${book.code ? `${book.code} · ` : ''}${categoryName(book.category_id)}</p>
        <h1>${book.title}</h1>
        ${book.author ? raw(html`<p class="author">${book.author}</p>`) : ''}
        ${book.status === 'pending' ? raw('<p class="badge badge-warn">Pendiente de revisión</p>') : ''}
        <dl class="meta">
          ${book.kind ? raw(html`<dt>Tipo</dt><dd>${book.kind}</dd>`) : ''}
          ${book.pages ? raw(html`<dt>Páginas</dt><dd>${book.pages}</dd>`) : ''}
          ${book.binding ? raw(html`<dt>Formato</dt><dd>${book.binding}${book.interior ? `, ${book.interior}` : ''}</dd>`) : ''}
          ${book.price_eur ? raw(html`<dt>PVP</dt><dd>${Number(book.price_eur).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}${book.catalog_date ? ` (catálogo ${fmtShort(book.catalog_date)})` : ''}</dd>`) : ''}
          ${codes.length ? raw(html`<dt>Código de barras</dt><dd>${codes.map((c) => raw(html`<span class="barcode">${formatCode(c.code)}${c.status === 'pending' ? raw(' <span class="badge badge-warn">propuesto</span>') : ''}${admin && c.status === 'approved' && !c.verified ? raw(' <span class="badge">sin verificar</span>') : ''}</span>`))}</dd>`) : ''}
        </dl>
        ${book.description ? raw(html`<p class="desc">${book.description}</p>`) : ''}
        ${book.meta?.fuente_sombra ? raw(html`<p class="small"><a href="${book.meta.fuente_sombra}" target="_blank" rel="noopener">Ficha en Distribuciones Sombra ↗</a></p>`) : ''}
      </div>
    </article>

    ${entry ? raw(html`
      <section class="panel owned">
        <p class="badge badge-ok">En tu biblioteca</p>
        <p>Registrado el <strong>${fmtDate(entry.added_at)}</strong></p>
        <form class="form entry-form">
          <label>Estado
            <select name="condition">
              <option value="">—</option>
              ${CONDITIONS.map((c) => raw(html`<option ${entry.condition === c ? 'selected' : ''}>${c}</option>`))}
            </select>
          </label>
          <label>Notas <textarea name="notes" rows="3" placeholder="Edición, firmas, dónde lo compré…">${entry.notes ?? ''}</textarea></label>
          <div class="actions">
            <button type="button" class="btn btn-ghost btn-danger-text" data-remove>Quitar</button>
            <button class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </section>`) : raw(html`
      <section class="panel">
        <p>No tienes este libro.</p>
        <div class="actions">
          ${supporter ? raw(html`<button class="btn btn-ghost" data-wish>${wished ? '★ En deseos' : '☆ Lo quiero'}</button>`) : ''}
          <button class="btn btn-primary" data-add>Añadir a mi biblioteca</button>
        </div>
      </section>`)}

    ${entry ? raw(supporter ? html`
      <section class="panel">
        <h2>Préstamos</h2>
        ${activeLoan
          ? raw(html`<p>Prestado a <strong>${activeLoan.lent_to}</strong> desde el ${fmtShort(activeLoan.lent_at)}.</p>
              <button class="btn btn-ghost" data-return="${activeLoan.id}">Marcar devuelto</button>`)
          : raw(html`<form class="inline-form loan-form"><input name="to" required placeholder="¿A quién se lo prestas?" maxlength="80"><button class="btn btn-ghost">Prestar</button></form>`)}
        ${loans.filter((l) => l.returned_at).length ? raw(html`<ul class="history">${loans.filter((l) => l.returned_at).map((l) =>
          raw(html`<li>${l.lent_to}: ${fmtShort(l.lent_at)} → ${fmtShort(l.returned_at)}</li>`))}</ul>`) : ''}
      </section>` : html`
      <a class="panel teaser" href="#/mecenas">🔒 Registro de préstamos y lista de deseos: <strong>hazte Mecenas</strong></a>`) : ''}

    ${admin ? raw(html`
      <section class="panel admin">
        <h2>Administración</h2>
        <dl class="meta audit">${raw(provenance(book))}</dl>
        ${codes.length ? raw(html`<ul class="rows">${codes.map((c) => raw(html`<li class="row" data-code="${c.code}">
          <span class="row-title">${formatCode(c.code)}<small>${barcodeInfo(c)}</small></span>
          ${c.status === 'pending' || !c.verified ? raw('<button class="btn btn-sm btn-ghost" data-code-ok>Verificar</button>') : ''}
          <button class="btn btn-sm btn-ghost btn-danger-text" data-code-del aria-label="Quitar código">Quitar</button>
        </li>`))}</ul>`) : ''}
        <form class="inline-form barcode-form"><input name="barcode" inputmode="numeric" placeholder="Añadir código de barras"><button class="btn btn-ghost">Añadir</button></form>
        <div class="actions">
          <button class="btn btn-ghost btn-danger-text" data-delete>Borrar del catálogo</button>
          ${book.status === 'pending' ? raw('<button class="btn btn-ghost" data-approve>Aprobar</button>') : ''}
          <button class="btn btn-primary" data-edit>Editar</button>
        </div>
      </section>`) : ''}`;

  const rerender = () => renderBook(root, { id });
  const run = (fn) => async (e) => {
    e?.preventDefault?.();
    try { await fn(e); } catch (err) { toast(errMsg(err), 'error'); }
  };

  $('[data-add]', root)?.addEventListener('click', run(async () => {
    await api.addToLibrary(uid, book.id);
    if (wished) { await api.removeWish(uid, book.id).catch(() => {}); state.wishlist.delete(book.id); }
    await refreshLibrary();
    toast('Añadido a tu biblioteca', 'ok');
    rerender();
  }));

  $('[data-wish]', root)?.addEventListener('click', run(async () => {
    if (wished) { await api.removeWish(uid, book.id); state.wishlist.delete(book.id); }
    else { await api.addWish(uid, book.id); state.wishlist.add(book.id); }
    rerender();
  }));

  $('.entry-form', root)?.addEventListener('submit', run(async (e) => {
    const f = new FormData(e.target);
    await api.updateLibraryEntry(uid, book.id, { condition: f.get('condition') || null, notes: f.get('notes').trim() || null });
    await refreshLibrary();
    toast('Guardado', 'ok');
  }));

  $('[data-remove]', root)?.addEventListener('click', run(async () => {
    if (!(await confirmDialog(`¿Quitar «${book.title}» de tu biblioteca? Se perderán la fecha de registro y las notas.`, { ok: 'Quitar', danger: true }))) return;
    await api.removeFromLibrary(uid, book.id);
    await refreshLibrary();
    toast('Quitado de tu biblioteca');
    rerender();
  }));

  $('.loan-form', root)?.addEventListener('submit', run(async (e) => {
    await api.addLoan(uid, book.id, e.target.to.value.trim());
    rerender();
  }));

  $('[data-return]', root)?.addEventListener('click', run(async (e) => {
    await api.returnLoan(e.target.dataset.return);
    rerender();
  }));

  $('.barcode-form', root)?.addEventListener('submit', run(async (e) => {
    const code = normalizeCode(e.target.barcode.value);
    if (!code) { toast('Código no válido. Revisa los dígitos.', 'error'); return; }
    await api.addBarcode(uid, code, book.id, { admin: true });
    await refreshCatalog();
    rerender();
  }));

  root.querySelectorAll('[data-code-ok], [data-code-del]').forEach((btn) => btn.addEventListener('click', run(async () => {
    const code = btn.closest('[data-code]').dataset.code;
    if (btn.hasAttribute('data-code-ok')) await api.updateBarcode(code, book.id, { status: 'approved', verified: true });
    else await api.deleteBarcode(code, book.id);
    await refreshCatalog();
    rerender();
  })));

  $('[data-edit]', root)?.addEventListener('click', run(async () => {
    const res = await bookFormDialog({ initial: book, heading: 'Editar libro' });
    if (!res) return;
    await api.updateBook(book.id, res.fields);
    await refreshCatalog();
    toast('Libro actualizado', 'ok');
    rerender();
  }));

  $('[data-approve]', root)?.addEventListener('click', run(async () => {
    await api.updateBook(book.id, { status: 'approved' });
    await refreshCatalog();
    rerender();
  }));

  $('[data-delete]', root)?.addEventListener('click', run(async () => {
    if (!(await confirmDialog(`¿Borrar «${book.title}» del catálogo? Desaparecerá de todas las bibliotecas.`, { ok: 'Borrar', danger: true }))) return;
    await api.deleteBook(book.id);
    await Promise.all([refreshCatalog(), refreshLibrary()]);
    toast('Libro borrado');
    navigate('/catalogo');
  }));
}

const SOURCE_LABEL = { sombra: 'Distribuciones Sombra', admin: 'admin', usuario: 'usuario' };

/** Quién y cuándo añadió el libro al catálogo general (solo admin). */
function provenance(book) {
  const rows = [];
  if (book.source === 'csv') {
    rows.push(['Origen', 'Importado del CSV del catálogo (Sombra / Tesoros / Codex)']);
  } else {
    rows.push(['Propuesto por', `${personName(book.created_by) ?? 'desconocido'} · ${fmtDate(book.created_at)}`]);
  }
  if (book.status === 'pending') rows.push(['Estado', 'Pendiente de validar']);
  else if (book.approved_at) rows.push(['Validado por', `${personName(book.approved_by) ?? 'desconocido'} · ${fmtDate(book.approved_at)}`]);
  return rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** Estado y procedencia de un código de barras (solo admin). */
function barcodeInfo(c) {
  const status = c.status === 'pending' ? 'pendiente' : c.verified ? 'verificado' : 'sin verificar';
  const who = c.source === 'sombra' ? 'Distribuciones Sombra'
    : `${personName(c.created_by) ?? SOURCE_LABEL[c.source]} · ${fmtShort(c.created_at)}`;
  const approved = c.approved_at ? ` · validado por ${personName(c.approved_by) ?? 'desconocido'} ${fmtShort(c.approved_at)}` : '';
  return `${status} · ${who}${approved}`;
}
