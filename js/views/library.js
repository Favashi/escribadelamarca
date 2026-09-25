import { html, raw, $, cover, fmtShort, toast } from '../util.js';
import { icon } from '../icons.js';
import { state, user, groupByCategory, matches, compareBooks, categoryName, refreshLibrary } from '../store.js';
import { viewHeader, errMsg } from '../ui.js';
import { setNavList } from '../navlist.js';
import { isNewBook, newInMySeries } from '../achievements.js';
import { removeWithUndo, addMany } from '../library-actions.js';
import { markIcons, markText, hasMark } from '../marks.js';
import * as api from '../api.js';

const LS_KEY = 'edm.showMissing';
const VIEW_KEY = 'edm.libView';
const SORT_KEY = 'edm.libSort';
const MARK_KEY = 'edm.libMarks';
const MARK_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'unread', label: 'Sin leer', test: (id) => !hasMark(id, 'read_at') },
  { id: 'read', label: 'Leídos', test: (id) => hasMark(id, 'read_at') },
  { id: 'unplayed', label: 'Sin jugar ni dirigir', test: (id) => !hasMark(id, 'played_at') && !hasMark(id, 'directed_at') },
  { id: 'played', label: 'Jugados', test: (id) => hasMark(id, 'played_at') },
  { id: 'directed', label: 'Dirigidos', test: (id) => hasMark(id, 'directed_at') },
];
const SORTS = [
  { id: 'code', label: 'Serie y número' },
  { id: 'recent', label: 'Añadidos recientemente' },
  { id: 'title', label: 'Título (A–Z)' },
];

export function renderLibrary(root) {
  let query = '';
  let showMissing = false;
  let mode = 'categories';
  let markMode = false;   // «Marcar lo que tengo»: las casillas de las series se tocan para añadir/quitar
  let sort = 'code';
  let markFilter = '';
  try {
    showMissing = localStorage.getItem(LS_KEY) === '1';
    mode = localStorage.getItem(VIEW_KEY) === 'series' ? 'series' : 'categories';
    sort = SORTS.some((o) => o.id === localStorage.getItem(SORT_KEY)) ? localStorage.getItem(SORT_KEY) : 'code';
    markFilter = MARK_FILTERS.some((o) => o.id === localStorage.getItem(MARK_KEY)) ? localStorage.getItem(MARK_KEY) : '';
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
      <button type="button" class="filters-btn" aria-expanded="false" aria-controls="lib-filters" ${mode === 'series' ? 'hidden' : ''}>
        ${raw(icon('filter', { cls: 'lf-icon' }))}<span>Filtros</span><b class="filter-count" hidden></b></button>
    </div>
    <div class="filters-body" id="lib-filters" hidden>
          <label class="lib-sort"><span>Ordenar por</span>
            <select name="sort">${SORTS.map((o) => raw(html`<option value="${o.id}" ${sort === o.id ? 'selected' : ''}>${o.label}</option>`))}</select>
          </label>
          <label class="lib-sort lib-marks"><span>Mostrar</span>
            <select name="marks">${MARK_FILTERS.map((o) => raw(html`<option value="${o.id}" ${markFilter === o.id ? 'selected' : ''}>${o.label}</option>`))}</select>
          </label>
          <label class="switch missing-toggle"><input type="checkbox" ${showMissing ? 'checked' : ''}> <span>Ver los que me faltan</span></label>
          <button type="button" class="btn btn-ghost btn-sm filters-clear" data-clear-filters>Limpiar filtros</button>
    </div>
    <div class="news-slot"></div>
    <div class="groups"></div>`;

  const list = $('.groups', root);

  /** Burbuja con cuántos filtros están activos (orden distinto del normal, «Mostrar» o «Ver los que me faltan»). */
  function updateFilterCount() {
    const n = (sort !== 'code') + (markFilter !== '') + (showMissing ? 1 : 0);
    const b = $('.filter-count', root);
    b.textContent = n;
    b.hidden = !n;
    $('.filters-btn', root).setAttribute('aria-label', n ? `Filtros, ${n} activos` : 'Filtros');
    $('[data-clear-filters]', root).disabled = !n;
  }

  function draw() {
    if (mode === 'series') return drawSeries();
    const markTest = MARK_FILTERS.find((o) => o.id === markFilter)?.test;
    const pool = (showMissing ? state.catalog.filter((b) => b.status === 'approved' || state.library.has(b.id)) : owned)
      .filter((b) => matches(b, query) && (!markTest || markTest(b.id)));

    if (!owned.length && !showMissing) {
      list.innerHTML = html`<div class="empty">
        <div class="empty-icon" aria-hidden="true">${raw(icon('scroll'))}</div>
        <h2>Tu biblioteca está vacía</h2>
        <p class="muted">Escanea el código de barras de tus libros o, si tienes muchos, márcalos de golpe por series.</p>
        <div class="actions center">
          <a class="btn btn-primary" href="#/escanear">Escanear libro</a>
          <button type="button" class="btn btn-ghost" data-start-marking>✎ Marcar por series</button>
        </div>
      </div>`;
      return;
    }

    if (!pool.length) {
      list.innerHTML = html`<p class="muted pad">${query ? `Sin resultados para «${query}».` : 'Ningún libro con ese filtro.'}</p>`;
      return;
    }

    const card = (b) => {
      const entry = state.library.get(b.id);
      return raw(html`<a class="card ${entry ? '' : 'missing'}" href="#/libro/${b.id}">
        ${raw(cover(b))}
        <span class="card-title">${b.title}</span>
        <span class="card-meta">${b.code ? `${b.code} · ` : ''}${entry ? fmtShort(entry.added_at) : 'No lo tengo'}</span>
        ${raw(markIcons(b.id))}
      </a>`);
    };

    // Por fecha o por título: una sola lista, sin agrupar por categoría (lo que falta, al final)
    if (sort !== 'code') {
      const added = (b) => state.library.get(b.id)?.added_at ?? '';
      const books = [...pool].sort(sort === 'recent'
        ? (a, z) => String(added(z)).localeCompare(String(added(a))) || compareBooks(a, z)
        : (a, z) => (state.library.has(z.id) - state.library.has(a.id)) || a.title.localeCompare(z.title, 'es'));
      setNavList(books.map((b) => b.id), 'Mi biblioteca');
      const title = SORTS.find((o) => o.id === sort).label;
      list.innerHTML = html`<section class="group flat">
        <h2 class="group-flat-title"><span>${title}</span><span class="count">${books.filter((b) => state.library.has(b.id)).length}</span></h2>
        <div class="grid">${books.map(card)}</div>
      </section>`;
      return;
    }

    const groups = groupByCategory(pool).filter((g) => g.books.length);
    setNavList(groups.flatMap((g) => g.books.map((b) => b.id)), 'Mi biblioteca');

    list.innerHTML = groups.map((g) => {
      const total = approved.filter((b) => b.category_id === g.category.id).length;
      const have = owned.filter((b) => b.category_id === g.category.id).length;
      return html`<details class="group" open>
        <summary><span>${g.category.name}</span><span class="count">${have}${total ? ` / ${total}` : ''}</span></summary>
        <div class="grid">${g.books.map(card)}</div>
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
      const marks = markText(b.id);
      const label = `${b.code ?? ''} · ${b.title} · ${have ? 'lo tienes' : wished ? 'en tu lista de deseos' : 'no lo tienes'}${marks ? ` · ${marks}` : ''}`;
      const fresh = isNewBook(b);
      if (markMode) {
        return html`<button type="button" class="tile marking ${have ? 'owned' : 'missing'} ${fresh ? 'is-new' : ''}" data-mark="${b.id}"
          aria-pressed="${String(have)}" aria-label="${b.code ?? ''} · ${b.title} · ${have ? 'lo tienes: toca para quitar' : 'toca para marcar que lo tienes'}">${b.code ?? '?'}</button>`;
      }
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
        ${markMode && missing.length ? raw(html`<button type="button" class="btn btn-sm btn-ghost mark-all" data-mark-all="${missing.map((b) => b.id).join(',')}">
          ✓ Marcar ${seriesCode ? `toda la serie ${seriesCode}` : 'todas'} (${missing.length})</button>`) : ''}
        <p class="series-missing">${missing.length
          ? raw(html`${missingNew.length ? raw(html`Novedades que te faltan: <strong>${codes(missingNew)}</strong>${missingOld.length ? raw('<br>') : ''}`) : ''}
              ${missingOld.length ? raw(html`Te faltan: <strong>${codes(missingOld)}</strong>`) : ''}`)
          : raw('<span class="complete">✦ ¡Serie completa!</span>')}</p>
      </section>`;
    };

    if (!multi.length && !singles.length) { list.innerHTML = html`<p class="muted pad">Sin resultados para «${query}».</p>`; return; }
    setNavList([...multi.flatMap((sr) => sr.books), ...singles].map((b) => b.id), 'Series');
    list.innerHTML = html`
      ${markMode ? raw(html`<div class="mark-bar" role="status">
          <span><strong>Modo marcar:</strong> toca las casillas de los libros que tienes. Toca de nuevo para quitarlos.</span>
          <button type="button" class="btn btn-sm btn-primary" data-mark-off>Listo</button>
        </div>`) : raw(html`<button type="button" class="btn btn-ghost btn-block mark-start" data-mark-on>✎ Marcar los libros que tengo</button>`)}
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

  // Modo marcar (vista por series): añadir o quitar tocando casillas, sin abrir cada ficha
  list.addEventListener('click', async (e) => {
    if (e.target.closest('[data-mark-on]')) { markMode = true; draw(); return; }
    if (e.target.closest('[data-start-marking]')) {
      mode = 'series';
      try { localStorage.setItem(VIEW_KEY, mode); } catch { /* sin storage */ }
      root.querySelector('input[name=mode][value=series]').checked = true;
      $('.filters-btn', root).hidden = true;
      $('#lib-filters', root).hidden = true;
      markMode = true;
      draw();
      return;
    }
    if (e.target.closest('[data-mark-off]')) { markMode = false; draw(); return; }
    const all = e.target.closest('[data-mark-all]');
    if (all) {
      all.disabled = true;
      try {
        const n = await addMany(all.dataset.markAll.split(','));
        toast(`${n} ${n === 1 ? 'libro añadido' : 'libros añadidos'}`, 'ok');
      } catch (err) { toast(errMsg(err), 'error'); }
      draw();
      return;
    }
    const tileBtn = e.target.closest('[data-mark]');
    if (!tileBtn || tileBtn.disabled) return;
    const id = tileBtn.dataset.mark;
    tileBtn.disabled = true;
    try {
      if (state.library.has(id)) {
        await removeWithUndo(id, draw);
      } else {
        tileBtn.classList.replace('missing', 'owned');   // respuesta inmediata
        await api.addToLibrary(user().id, id);
        await refreshLibrary();
        draw();
      }
    } catch (err) {
      if (err?.code === '23505') { await refreshLibrary(); draw(); return; }
      toast(errMsg(err), 'error');
      tileBtn.disabled = false;
    }
  });

  root.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
    mode = r.value;
    markMode = false;
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* sin storage */ }
    $('.filters-btn', root).hidden = mode === 'series';
    if (mode === 'series') { $('#lib-filters', root).hidden = true; $('.filters-btn', root).setAttribute('aria-expanded', 'false'); }
    draw();
  }));
  $('.filters-btn', root).addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    $('#lib-filters', root).hidden = !open;
  });
  $('[data-clear-filters]', root).addEventListener('click', () => {
    sort = 'code'; markFilter = ''; showMissing = false;
    $('.lib-sort select', root).value = sort;
    $('.lib-marks select', root).value = markFilter;
    $('.missing-toggle input', root).checked = false;
    try { localStorage.setItem(SORT_KEY, sort); localStorage.setItem(MARK_KEY, ''); localStorage.setItem(LS_KEY, '0'); } catch { /* sin storage */ }
    updateFilterCount();
    draw();
  });
  $('.lib-marks select', root).addEventListener('change', (e) => {
    markFilter = e.target.value;
    try { localStorage.setItem(MARK_KEY, markFilter); } catch { /* sin storage */ }
    updateFilterCount();
    draw();
  });
  $('.lib-sort select', root).addEventListener('change', (e) => {
    sort = e.target.value;
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* sin storage */ }
    updateFilterCount();
    draw();
  });
  $('.search', root).addEventListener('input', (e) => { query = e.target.value.trim(); draw(); });
  $('.missing-toggle input', root).addEventListener('change', (e) => {
    showMissing = e.target.checked;
    try { localStorage.setItem(LS_KEY, showMissing ? '1' : '0'); } catch { /* sin storage */ }
    updateFilterCount();
    draw();
  });
  updateFilterCount();
  draw();
}
