import { html, raw, $, cover, fmtShort } from '../util.js';
import { state, groupByCategory, matches, compareBooks, categoryName } from '../store.js';
import { viewHeader } from '../ui.js';
import { setNavList } from '../navlist.js';
import { isNewBook, newInMySeries } from '../achievements.js';

const LS_KEY = 'edm.showMissing';
const VIEW_KEY = 'edm.libView';

export function renderLibrary(root) {
  let query = '';
  let showMissing = false;
  let mode = 'categories';
  try {
    showMissing = localStorage.getItem(LS_KEY) === '1';
    mode = localStorage.getItem(VIEW_KEY) === 'series' ? 'series' : 'categories';
  } catch { /* sin storage */ }

  const owned = state.catalog.filter((b) => state.library.has(b.id));
  const approved = state.catalog.filter((b) => b.status === 'approved');

  root.innerHTML = html`
    ${raw(viewHeader('Mi biblioteca', `${owned.length} ${owned.length === 1 ? 'libro' : 'libros'} de ${approved.length} en el catálogo`))}
    <div class="seg lib-mode" role="radiogroup" aria-label="Vista">
      <label><input type="radio" name="mode" value="categories" ${mode === 'categories' ? 'checked' : ''}><span>Por categorías</span></label>
      <label><input type="radio" name="mode" value="series" ${mode === 'series' ? 'checked' : ''}><span>Por series</span></label>
    </div>
    <div class="toolbar">
      <input type="search" class="search" placeholder="Buscar título, código o autor…" aria-label="Buscar">
      <label class="switch missing-toggle" ${mode === 'series' ? 'hidden' : ''}><input type="checkbox" ${showMissing ? 'checked' : ''}> <span>Ver los que me faltan</span></label>
    </div>
    <div class="news-slot"></div>
    <div class="groups"></div>`;

  const list = $('.groups', root);

  function draw() {
    if (mode === 'series') return drawSeries();
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
    setNavList(groups.flatMap((g) => g.books.map((b) => b.id)), 'Mi biblioteca');

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

  /** Vista por series: todas las publicaciones de cada serie, con los huecos a la vista. */
  function drawSeries() {
    const visible = state.catalog.filter((b) => b.series && (b.status === 'approved' || state.library.has(b.id)));
    const bySeries = new Map();
    for (const b of visible) (bySeries.get(b.series) ?? bySeries.set(b.series, []).get(b.series)).push(b);
    const catOrder = (id) => state.categories.find((c) => c.id === id)?.sort_order ?? 999;
    let series = [...bySeries.entries()].map(([code, books]) => ({ code, books: books.sort(compareBooks) }));
    // Filtro: por código de serie o por cualquier libro de la serie
    if (query) series = series.filter((sr) => sr.code.toLowerCase().startsWith(query.toLowerCase()) || sr.books.some((b) => matches(b, query)));
    series.sort((a, z) => catOrder(a.books[0].category_id) - catOrder(z.books[0].category_id) || z.books.length - a.books.length || a.code.localeCompare(z.code, 'es'));
    const multi = series.filter((sr) => sr.books.length > 1);
    const singles = series.filter((sr) => sr.books.length === 1).flatMap((sr) => sr.books).sort(compareBooks);

    const tile = (b) => {
      const have = state.library.has(b.id);
      const wished = !have && state.wishlist.has(b.id);
      const label = `${b.code ?? ''} · ${b.title} · ${have ? 'lo tienes' : wished ? 'en tu lista de deseos' : 'no lo tienes'}`;
      const fresh = isNewBook(b);
      return html`<a class="tile ${have ? 'owned' : 'missing'} ${wished ? 'wished' : ''} ${fresh ? 'is-new' : ''}" href="#/libro/${b.id}"
        title="${label}${fresh ? ' · novedad' : ''}" aria-label="${label}${fresh ? ', novedad' : ''}">${b.code ?? '?'}</a>`;
    };
    const achievements = new Map(state.achievements.map((a) => [a.key, a]));
    const section = (title, sub, books, seriesCode = null) => {
      const have = books.filter((b) => state.library.has(b.id)).length;
      const missing = books.filter((b) => !state.library.has(b.id));
      const missingNew = missing.filter(isNewBook);
      const missingOld = missing.filter((b) => !isNewBook(b));
      const newCount = books.filter(isNewBook).length;
      const p = Math.round((have / books.length) * 100);
      const ach = seriesCode ? achievements.get(`series:${seriesCode}`) : null;
      const upToDate = !missing.length;
      const codes = (list) => list.map((b) => b.code).filter(Boolean).join(', ');
      return html`<section class="series-block panel">
        <header class="series-head"><h2>${title}${sub ? raw(html` <small>${sub}</small>`) : ''}</h2><span class="count">${have} / ${books.length}</span></header>
        ${seriesCode && (ach || upToDate || newCount) ? raw(html`<p class="series-status">
          ${ach ? raw(html`<span class="st st-complete" title="Logro permanente">✦ Completa${ach.level > 1 ? ` ×${ach.level}` : ''}</span>`) : ''}
          ${upToDate ? raw('<span class="st st-uptodate">● Al día</span>') : ''}
          ${newCount ? raw(html`<span class="st st-new">${newCount} ${newCount === 1 ? 'nuevo' : 'nuevos'}</span>`) : ''}
        </p>`) : ''}
        <span class="bar" role="img" aria-label="${have} de ${books.length}"><span style="width:${p}%"></span></span>
        <div class="tiles">${books.map((b) => raw(tile(b)))}</div>
        <p class="series-missing">${missing.length
          ? raw(html`${missingNew.length ? raw(html`Novedades que te faltan: <strong>${codes(missingNew)}</strong>${missingOld.length ? raw('<br>') : ''}`) : ''}
              ${missingOld.length ? raw(html`Te faltan: <strong>${codes(missingOld)}</strong>`) : ''}`)
          : raw('<span class="complete">✦ ¡Serie completa!</span>')}</p>
      </section>`;
    };

    if (!multi.length && !singles.length) { list.innerHTML = html`<p class="muted pad">Sin resultados para «${query}».</p>`; return; }
    setNavList([...multi.flatMap((sr) => sr.books), ...singles].map((b) => b.id), 'Series');
    list.innerHTML = html`
      <p class="muted small legend"><span class="tile owned sample">B1</span> lo tienes
        <span class="tile missing sample">B2</span> te falta
        ${state.wishlist.size ? raw('<span class="tile missing wished sample">B3</span> en tu lista de deseos') : ''}</p>
      ${multi.map((sr) => raw(section(`Serie ${sr.code}`, categoryName(sr.books[0].category_id), sr.books, sr.code)))}
      ${singles.length ? raw(section('Otras publicaciones', '', singles)) : ''}`;
  }

  // Novedades en series que coleccionas
  const news = newInMySeries();
  if (news.length) {
    const total = news.reduce((t, n) => t + n.books.length, 0);
    const list = news.map((n) => n.books.map((b) => b.code).join(', ')).join(', ');
    $('.news-slot', root).innerHTML = html`<div class="news-banner">
      <span>${raw('<b>✦</b>')} Han salido <strong>${total} ${total === 1 ? 'módulo nuevo' : 'módulos nuevos'}</strong> en series que coleccionas: ${list}.</span>
      ${mode === 'series' ? '' : raw('<button type="button" class="btn btn-sm btn-ghost" data-see-series>Ver por series</button>')}
    </div>`;
    $('[data-see-series]', root)?.addEventListener('click', () => {
      const radio = root.querySelector('input[name=mode][value=series]');
      radio.checked = true; radio.dispatchEvent(new Event('change'));
      $('[data-see-series]', root)?.remove();
    });
  }

  root.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
    mode = r.value;
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* sin storage */ }
    $('.missing-toggle', root).hidden = mode === 'series';
    draw();
  }));
  $('.search', root).addEventListener('input', (e) => { query = e.target.value.trim(); draw(); });
  $('.switch input', root).addEventListener('change', (e) => {
    showMissing = e.target.checked;
    try { localStorage.setItem(LS_KEY, showMissing ? '1' : '0'); } catch { /* sin storage */ }
    draw();
  });
  draw();
}
