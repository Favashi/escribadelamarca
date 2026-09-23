import { html, raw, $, cover, fmtDate, toast } from '../util.js';
import { state, isAdmin, bookById, categoryName, personName, refreshCatalog, refreshLibrary, refreshSuggestions } from '../store.js';
import { confirmDialog, viewHeader, errMsg, fieldText, FIELD_LABELS } from '../ui.js';
import { formatCode } from '../isbn.js';
import { updateAdminBadge } from '../nav.js';
import { adminTabs } from './admin.js';
import * as api from '../api.js';

/** Revisión (solo admin): libros y códigos de barras propuestos por los usuarios. */
export function renderReview(root) {
  if (!isAdmin()) {
    root.innerHTML = html`<div class="empty"><h2>Solo para administradores</h2><a class="btn btn-ghost" href="#/biblioteca">Volver</a></div>`;
    return;
  }

  // Contenedor propio: #view se reutiliza entre vistas y no debe acumular listeners
  root.innerHTML = '<div class="review"></div>';
  const wrap = $('.review', root);

  function draw() {
    const books = state.catalog.filter((b) => b.status === 'pending')
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const codes = state.barcodes.filter((c) => c.status === 'pending')
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const suggestions = state.suggestions.filter((sg) => sg.status === 'pending')
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const by = (id, date) => `Propuesto por ${personName(id) ?? 'desconocido'} el ${fmtDate(date)}`;

    wrap.innerHTML = html`
      ${raw(viewHeader('Administración'))}
      ${raw(adminTabs('revision'))}
      <p class="muted admin-sub">${books.length + codes.length + suggestions.length
        ? `${books.length + codes.length + suggestions.length} propuestas pendientes de revisar`
        : 'No hay nada pendiente de revisar'}</p>

      <section class="panel">
        <h2>Sugerencias de cambios <span class="count">${suggestions.length}</span></h2>
        ${suggestions.length ? raw(html`<ul class="rows">${suggestions.map((sg) => {
          const b = bookById(sg.catalog_id);
          return raw(html`<li class="review-row suggestion-row" data-suggestion="${sg.id}">
            <div class="review-info">
              <a class="row-title" href="#/libro/${sg.catalog_id}">${b?.code ? raw(html`<span class="code">${b.code}</span> `) : ''}${b?.title ?? '—'}</a>
              <small>${by(sg.created_by, sg.created_at)}</small>
              <ul class="diff">${Object.entries(sg.changes).map(([k, v]) => raw(html`<li><span>${FIELD_LABELS[k] || k}</span>
                <del>${fieldText(k, b?.[k])}</del> → <ins>${fieldText(k, v)}</ins></li>`))}</ul>
              ${sg.note ? raw(html`<small class="suggestion-note">«${sg.note}»</small>`) : ''}
            </div>
            <div class="review-actions">
              <button class="btn btn-sm btn-ghost btn-danger-text" data-sg-reject>Rechazar</button>
              <button class="btn btn-sm btn-primary" data-sg-approve>Validar y aplicar</button>
            </div>
          </li>`);
        })}</ul>`) : raw('<p class="muted">Ninguna sugerencia pendiente.</p>')}
      </section>

      <section class="panel">
        <h2>Libros nuevos <span class="count">${books.length}</span></h2>
        ${books.length ? raw(html`<ul class="rows">${books.map((b) => raw(html`
          <li class="review-row" data-book="${b.id}">
            ${raw(cover(b, 'cover-xs'))}
            <div class="review-info">
              <a class="row-title" href="#/libro/${b.id}">${b.code ? raw(html`<span class="code">${b.code}</span> `) : ''}${b.title}</a>
              <small>${categoryName(b.category_id)}${b.author ? ` · ${b.author}` : ''}</small>
              <small>${by(b.created_by, b.created_at)}</small>
            </div>
            <div class="review-actions">
              <button class="btn btn-sm btn-ghost btn-danger-text" data-reject>Rechazar</button>
              <button class="btn btn-sm btn-primary" data-approve>Validar</button>
            </div>
          </li>`))}</ul>`) : raw('<p class="muted">Ningún libro pendiente.</p>')}
      </section>

      <section class="panel">
        <h2>Códigos de barras <span class="count">${codes.length}</span></h2>
        ${codes.length ? raw(html`<ul class="rows">${codes.map((c) => {
          const b = bookById(c.catalog_id);
          return raw(html`<li class="review-row" data-book="${c.catalog_id}" data-code="${c.code}">
            ${b ? raw(cover(b, 'cover-xs')) : ''}
            <div class="review-info">
              <span class="row-title"><strong>${formatCode(c.code)}</strong> → <a href="#/libro/${c.catalog_id}">${b?.code ? `${b.code} · ` : ''}${b?.title ?? '—'}</a></span>
              <small>${by(c.created_by, c.created_at)}</small>
            </div>
            <div class="review-actions">
              <button class="btn btn-sm btn-ghost btn-danger-text" data-reject>Rechazar</button>
              <button class="btn btn-sm btn-primary" data-approve>Validar</button>
            </div>
          </li>`);
        })}</ul>`) : raw('<p class="muted">Ningún código pendiente.</p>')}
      </section>`;
  }

  wrap.addEventListener('click', async (e) => {
    const sgBtn = e.target.closest('[data-sg-approve], [data-sg-reject]');
    if (sgBtn) {
      const id = Number(sgBtn.closest('[data-suggestion]').dataset.suggestion);
      const approve = sgBtn.hasAttribute('data-sg-approve');
      try {
        if (approve) await api.adminApplySuggestion(id);
        else if (await confirmDialog('¿Rechazar esta sugerencia? No se aplicará ningún cambio.', { ok: 'Rechazar', danger: true })) await api.adminRejectSuggestion(id);
        else return;
        await Promise.all([refreshSuggestions(), refreshCatalog()]);
        toast(approve ? 'Cambios aplicados (quedan en el historial del libro)' : 'Sugerencia rechazada', approve ? 'ok' : 'info');
        updateAdminBadge();
        draw();
      } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    const btn = e.target.closest('[data-approve], [data-reject]');
    if (!btn) return;
    const row = btn.closest('.review-row');
    const book = bookById(row.dataset.book);
    const code = row.dataset.code;
    const approve = btn.hasAttribute('data-approve');
    try {
      if (code) {
        if (approve) await api.updateBarcode(code, book.id, { status: 'approved', verified: true });
        else await api.deleteBarcode(code, book.id);
      } else if (approve) {
        await api.updateBook(book.id, { status: 'approved' });
      } else {
        if (!(await confirmDialog(`¿Rechazar y borrar «${book.title}»? Se quitará de las bibliotecas que lo tengan.`, { ok: 'Borrar', danger: true }))) return;
        await api.deleteBook(book.id);
        await refreshLibrary();
      }
      btn.disabled = true;
      await refreshCatalog();
      toast(approve ? 'Validado: ya está en el catálogo general' : 'Rechazado', approve ? 'ok' : 'info');
      updateAdminBadge();
      draw();
    } catch (err) { toast(errMsg(err), 'error'); }
  });

  draw();
}
