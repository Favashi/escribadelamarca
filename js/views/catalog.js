import { html, raw, $, cover, toast } from '../util.js';
import { state, user, isAdmin, groupByCategory, refreshCatalog, refreshLibrary, bookById, matches, pendingCount } from '../store.js';
import { bookFormDialog, confirmDialog, viewHeader, errMsg } from '../ui.js';
import * as api from '../api.js';
import { setNavList } from '../navlist.js';
import { icon } from '../icons.js';

export function renderCatalog(root) {
  let query = '';
  const admin = isAdmin();

  function pendingSection() {
    const n = admin ? pendingCount() : 0;
    return n ? html`<a class="panel teaser" href="#/revision">📝 Hay <strong>${n}</strong> ${n === 1 ? 'propuesta pendiente' : 'propuestas pendientes'} de revisar →</a>` : '';
  }

  function draw() {
    const pool = state.catalog.filter((b) => (admin || b.status === 'approved' || b.created_by === user().id) && matches(b, query));
    const groups = groupByCategory(pool).filter((g) => g.books.length);
    setNavList(groups.flatMap((g) => g.books.map((b) => b.id)), 'Catálogo');

    root.querySelector('.groups').innerHTML = html`
      ${raw(pendingSection())}
      ${groups.length ? groups.map((g) => raw(html`<details class="group" ${query ? 'open' : ''}>
        <summary><span>${g.category.name}</span><span class="count">${g.books.length}</span></summary>
        <ul class="rows">
          ${g.books.map((b) => {
            const have = state.library.has(b.id);
            return raw(html`<li class="row" data-id="${b.id}">
              ${raw(cover(b, 'cover-xs'))}
              <a class="row-title" href="#/libro/${b.id}">${b.code ? raw(html`<span class="code">${b.code}</span> `) : ''}${b.title}${b.status === 'pending' ? raw(' <span class="badge badge-warn">pendiente</span>') : ''}${b.author ? raw(html`<small>${b.author}</small>`) : ''}</a>
              <button class="toggle ${have ? 'on' : ''}" data-toggle aria-pressed="${have}" aria-label="${have ? 'Quitar de' : 'Añadir a'} mi biblioteca">
                ${have ? '✓ Lo tengo' : '+ Añadir'}
              </button>
            </li>`);
          })}
        </ul>
      </details>`)) : raw(html`<p class="muted pad">Sin resultados.</p>`)}`;
  }

  root.innerHTML = html`
    ${raw(viewHeader('Catálogo', `${state.catalog.filter((b) => b.status === 'approved').length} publicaciones de la Marca del Este`, `<button class="btn btn-sm ${admin ? 'btn-admin' : 'btn-primary'}" data-new>${admin ? `${icon('shield')} Nuevo` : '+ Proponer'}</button>`))}
    <div class="toolbar"><input type="search" class="search" placeholder="Buscar título, código (B19) o autor…" aria-label="Buscar"></div>
    <div class="groups"></div>`;

  $('.search', root).addEventListener('input', (e) => { query = e.target.value.trim(); draw(); });

  $('[data-new]', root).onclick = async () => {
    const res = await bookFormDialog({
      heading: admin ? 'Nuevo libro' : 'Proponer libro',
      submit: admin ? 'Crear' : 'Proponer',
      note: admin ? '' : 'Tu propuesta será revisada antes de aparecer en el catálogo común.',
      withBarcode: true,
    });
    if (!res) return;
    try {
      const book = await api.createBook(user().id, res.fields, { admin });
      if (res.barcode) await api.addBarcode(user().id, res.barcode, book.id, { admin });
      await refreshCatalog();
      toast(admin ? 'Libro creado' : 'Propuesta enviada', 'ok');
      draw();
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  root.querySelector('.groups').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    const row = e.target.closest('[data-id]');
    if (!btn || !row) return;
    const book = bookById(row.dataset.id);
    btn.disabled = true;
    try {
      if (btn.hasAttribute('data-toggle')) {
        if (state.library.has(book.id)) {
          if (!(await confirmDialog(`¿Quitar «${book.title}» de tu biblioteca?`, { ok: 'Quitar', danger: true }))) { btn.disabled = false; return; }
          await api.removeFromLibrary(user().id, book.id);
        } else {
          await api.addToLibrary(user().id, book.id);
        }
        await refreshLibrary();
      }
      draw();
    } catch (err) {
      toast(errMsg(err), 'error');
      btn.disabled = false;
    }
  });

  draw();
}
