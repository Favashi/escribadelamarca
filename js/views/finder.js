import { html, raw, $, cover } from '../util.js';
import { state, matches, compareBooks, categoryName } from '../store.js';
import { viewHeader } from '../ui.js';
import { track } from '../track.js';
import { setNavList } from '../navlist.js';
import { icon } from '../icons.js';
import { hasMark, markIcons } from '../marks.js';

const LAST_PICK = 'edm.surprise';

const KEY = 'edm.finder2';
const EMPTY = { scope: 'mine', text: '', level: '', players: '', duration: '', tags: [], fresh: false, nodata: false };
const DURATIONS = [
  { id: '', label: 'Cualquiera' },
  { id: '1', label: 'Una sesión' },
  { id: '2-3', label: '2–3 sesiones' },
  { id: '4+', label: 'Campaña (4+)' },
];

/** Texto «Niveles 4–6 · 4–6 PJ · 1 sesión» con los datos de juego disponibles. */
export function gameInfo(b) {
  const range = (a, z) => (a && z && a !== z ? `${a}–${z}` : a || z);
  const parts = [];
  if (b.min_level || b.max_level) parts.push(`Niveles ${range(b.min_level, b.max_level)}`);
  if (b.min_players || b.max_players) parts.push(`${range(b.min_players, b.max_players)} PJ`);
  if (b.sessions) parts.push(b.sessions === 1 ? '1 sesión' : `${b.sessions} sesiones`);
  return parts.join(' · ');
}

const hasGameData = (b) => b.min_level || b.max_level || b.min_players || b.sessions || (b.tags && b.tags.length);

export async function renderFinder(root) {
  let f = { ...EMPTY };
  try { f = { ...f, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { /* sin storage */ }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* sin storage */ } };

  const done = (id) => hasMark(id, 'played_at') || hasMark(id, 'directed_at');

  // Etiquetas disponibles, las más frecuentes primero
  const tagCount = new Map();
  for (const b of state.catalog) for (const t of b.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const allTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([t]) => t);

  root.innerHTML = html`
    ${raw(viewHeader('Buscador de aventuras', '¿Qué módulo preparo para la próxima partida?'))}
    <form class="finder panel" autocomplete="off">
      <div class="seg scope" role="radiogroup" aria-label="Buscar en">
        <label><input type="radio" name="scope" value="mine" ${f.scope === 'mine' ? 'checked' : ''}><span>Mi biblioteca (${state.library.size})</span></label>
        <label><input type="radio" name="scope" value="all" ${f.scope === 'all' ? 'checked' : ''}><span>Todo el catálogo</span></label>
      </div>
      <div class="finder-grid">
        <label>Nivel del grupo <input name="level" type="number" inputmode="numeric" min="1" max="36" placeholder="Ej. 3" value="${f.level}"></label>
        <label>Jugadores <input name="players" type="number" inputmode="numeric" min="1" max="12" placeholder="Ej. 4" value="${f.players}"></label>
      </div>
      <div class="finder-row">
        <input name="text" type="search" class="search" placeholder="Título, código o autor…" value="${f.text}" aria-label="Título, código o autor">
        <button type="button" class="filters-btn" aria-expanded="false" aria-controls="finder-more">
          ${raw(icon('filter', { cls: 'lf-icon' }))}<span>Más filtros</span><b class="filter-count" hidden></b></button>
      </div>
      <div class="filters-body finder-more" id="finder-more" hidden>
        <label>Duración
          <select name="duration">${DURATIONS.map((d) => raw(html`<option value="${d.id}" ${f.duration === d.id ? 'selected' : ''}>${d.label}</option>`))}</select>
        </label>
        ${allTags.length ? raw(html`<div class="chips" role="group" aria-label="Etiquetas">
          ${allTags.map((t) => raw(html`<button type="button" class="chip ${f.tags.includes(t) ? 'on' : ''}" data-tag="${t}" aria-pressed="${String(f.tags.includes(t))}">${t}</button>`))}
        </div>`) : ''}
        <div class="finder-switches">
          <label class="switch"><input type="checkbox" name="fresh" ${f.fresh ? 'checked' : ''}> <span>Ocultar las que ya he jugado o dirigido</span></label>
          <label class="switch"><input type="checkbox" name="nodata" ${f.nodata ? 'checked' : ''}> <span>Incluir libros sin datos de juego</span></label>
        </div>
      </div>
      <div class="finder-actions"><button type="button" class="btn btn-ghost btn-sm filters-clear" data-clear>Limpiar filtros</button></div>
    </form>
    <div class="finder-bar">
      <p class="finder-count muted small"></p>
      <button type="button" class="btn btn-sm btn-ghost" data-surprise>${raw(icon('shuffle'))} Sorpréndeme</button>
    </div>
    <ul class="finder-results"></ul>
    <p class="muted small center pad">Datos de juego: <a href="https://github.com/diacritica/codexlmde" target="_blank" rel="noopener">Codex LMDE</a>.
      ¿Falta o está mal algún dato? Ábrelo y pulsa «✎ Sugerir cambios».</p>`;

  const form = $('.finder', root);
  const list = $('.finder-results', root);
  const count = $('.finder-count', root);
  const surprise = $('[data-surprise]', root);

  /** Burbuja de «Más filtros»: cuántos de los filtros plegados están activos. */
  const updateMoreCount = () => {
    const n = (f.duration ? 1 : 0) + f.tags.length + (f.fresh ? 1 : 0) + (f.nodata ? 1 : 0);
    const b = $('.finder-row .filter-count', root);
    b.textContent = n;
    b.hidden = !n;
    $('.finder-row .filters-btn', root).setAttribute('aria-label', n ? `Más filtros, ${n} activos` : 'Más filtros');
  };
  let results = [];

  function draw() {
    const lvl = Number(f.level) || null;
    const pj = Number(f.players) || null;
    const res = state.catalog.filter((b) => {
      if (b.status !== 'approved' && !state.library.has(b.id)) return false;
      if (!f.nodata && !hasGameData(b)) return false;
      if (!matches(b, f.text)) return false;
      if (lvl && !((b.min_level ?? b.max_level) <= lvl && lvl <= (b.max_level ?? b.min_level))) return false;
      if (pj && !((b.min_players ?? b.max_players) <= pj && pj <= (b.max_players ?? b.min_players))) return false;
      if (f.duration === '1' && b.sessions !== 1) return false;
      if (f.duration === '2-3' && !(b.sessions >= 2 && b.sessions <= 3)) return false;
      if (f.duration === '4+' && !(b.sessions >= 4 || (b.tags || []).includes('Campaña'))) return false;
      if (f.tags.length && !f.tags.every((t) => (b.tags || []).includes(t))) return false;
      if (f.scope === 'mine' && !state.library.has(b.id)) return false;
      if (f.fresh && done(b.id)) return false;
      return true;
    }).sort((a, b) => {
      // Con nivel: primero los módulos cuyo rango está más centrado en ese nivel
      if (lvl) {
        const d = (x) => Math.abs(((x.min_level ?? lvl) + (x.max_level ?? lvl)) / 2 - lvl);
        return d(a) - d(b) || compareBooks(a, b);
      }
      return compareBooks(a, b);
    });

    results = res;
    surprise.disabled = !res.length;
    setNavList(res.map((b) => b.id), 'Buscador');
    count.textContent = `${res.length} ${res.length === 1 ? 'resultado' : 'resultados'} en ${f.scope === 'mine' ? 'tu biblioteca' : 'todo el catálogo'}`;
    list.innerHTML = res.length ? res.map((b) => {
      const have = state.library.has(b.id);
      return html`<li><a class="finder-card" href="#/libro/${b.id}">
        ${raw(cover(b, 'cover-sm'))}
        <div class="finder-body">
          <h3>${b.code ? raw(html`<span class="code">${b.code}</span> `) : ''}${b.title}</h3>
          <p class="finder-meta">${gameInfo(b) || categoryName(b.category_id)}
            ${have ? raw('<span class="badge badge-ok">La tengo</span>') : ''}
            ${raw(markIcons(b.id))}</p>
          ${b.summary ? raw(html`<p class="finder-summary">${b.summary}</p>`) : ''}
          ${(b.tags || []).length ? raw(html`<p class="tags">${b.tags.slice(0, 5).map((t) => raw(html`<span class="tag">${t}</span>`))}</p>`) : ''}
        </div>
      </a></li>`;
    }).join('') : f.scope === 'mine'
      ? html`<li class="empty"><p class="muted">${state.library.size ? 'Ninguna aventura de tu biblioteca cumple esos filtros.' : 'Tu biblioteca está vacía.'}</p>
          <button type="button" class="btn btn-ghost" data-all>Buscar en todo el catálogo</button></li>`
      : html`<li class="empty"><p class="muted">Ninguna aventura cumple esos filtros.</p></li>`;
  }

  // Una «búsqueda» = una sesión de filtrado (se registra una vez, tras el primer cambio)
  let tracked = false;
  const noteSearch = () => { if (!tracked) { tracked = true; setTimeout(() => track('finder_search'), 3000); } };

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    f[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    save(); draw(); noteSearch(); updateMoreCount();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('.finder-row .filters-btn', root).addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    $('#finder-more', root).hidden = !open;
  });
  // Aventura al azar entre los resultados (sin repetir la anterior si hay más de una)
  surprise.addEventListener('click', () => {
    let last = null;
    try { last = sessionStorage.getItem(LAST_PICK); } catch { /* sin storage */ }
    const pool = results.length > 1 ? results.filter((b) => b.id !== last) : results;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    try { sessionStorage.setItem(LAST_PICK, pick.id); } catch { /* sin storage */ }
    location.hash = `#/libro/${pick.id}`;
  });
  list.addEventListener('click', (e) => {
    if (!e.target.closest('[data-all]')) return;
    f.scope = 'all'; save();
    form.querySelector('input[name=scope][value=all]').checked = true;
    draw();
  });
  form.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-tag]');
    if (chip) {
      const t = chip.dataset.tag;
      f.tags = f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t];
      chip.classList.toggle('on'); chip.setAttribute('aria-pressed', f.tags.includes(t));
      save(); draw(); noteSearch(); updateMoreCount();
    }
    if (e.target.closest('[data-clear]')) {
      f = { ...EMPTY, scope: f.scope };
      save(); renderFinder(root);
    }
  });

  updateMoreCount();
  draw();
}
