import { html, raw, $, cover, fmtShort } from '../util.js';
import { state, groupByCategory, matches } from '../store.js';
import { viewHeader } from '../ui.js';

const LS_KEY = 'edm.showMissing';

export function renderLibrary(root) {
  let query = '';
  let showMissing = false;
  try { showMissing = localStorage.getItem(LS_KEY) === '1'; } catch { /* sin storage */ }

  const owned = state.catalog.filter((b) => state.library.has(b.id));
  const approved = state.catalog.filter((b) => b.status === 'approved');

  root.innerHTML = html`
    ${raw(viewHeader('Mi biblioteca', `${owned.length} ${owned.length === 1 ? 'libro' : 'libros'} de ${approved.length} en el catálogo`))}
    <div class="toolbar">
      <input type="search" class="search" placeholder="Buscar título, código o autor…" aria-label="Buscar">
      <label class="switch"><input type="checkbox" ${showMissing ? 'checked' : ''}> <span>Ver los que me faltan</span></label>
    </div>
    <div class="groups"></div>`;

  const list = $('.groups', root);

  function draw() {
    const pool = (showMissing ? state.catalog.filter((b) => b.status === 'approved' || state.library.has(b.id)) : owned).filter((b) => matches(b, query));

    if (!owned.length && !showMissing) {
      list.innerHTML = html`<div class="empty">
        <div class="empty-icon" aria-hidden="true">📜</div>
        <h2>Tu biblioteca está vacía</h2>
        <p class="muted">Escanea el código de barras de tu primera aventura o márcala desde el catálogo.</p>
        <div class="actions center">
          <a class="btn btn-primary" href="#/escanear">Escanear libro</a>
          <a class="btn btn-ghost" href="#/catalogo">Ver catálogo</a>
        </div>
      </div>`;
      return;
    }

    const groups = groupByCategory(pool).filter((g) => g.books.length);
    if (!groups.length) { list.innerHTML = html`<p class="muted pad">Sin resultados para «${query}».</p>`; return; }

    list.innerHTML = groups.map((g) => {
      const total = approved.filter((b) => b.category_id === g.category.id).length;
      const have = owned.filter((b) => b.category_id === g.category.id).length;
      return html`<details class="group" open>
        <summary><span>${g.category.name}</span><span class="count">${have}${total ? ` / ${total}` : ''}</span></summary>
        <div class="grid">
          ${g.books.map((b) => {
            const entry = state.library.get(b.id);
            return raw(html`<a class="card ${entry ? '' : 'missing'}" href="#/libro/${b.id}">
              ${raw(cover(b))}
              <span class="card-title">${b.title}</span>
              <span class="card-meta">${b.code ? `${b.code} · ` : ''}${entry ? fmtShort(entry.added_at) : 'No lo tengo'}</span>
            </a>`);
          })}
        </div>
      </details>`;
    }).join('');
  }

  $('.search', root).addEventListener('input', (e) => { query = e.target.value.trim(); draw(); });
  $('.switch input', root).addEventListener('change', (e) => {
    showMissing = e.target.checked;
    try { localStorage.setItem(LS_KEY, showMissing ? '1' : '0'); } catch { /* sin storage */ }
    draw();
  });
  draw();
}
