// Distintivo de nivel (arriba a la derecha en Biblioteca, Catálogo y Buscador), su hoja de progreso y el selector de
// emblema. El nivel sale de los PX (js/achievements.js); el emblema, de profiles.emblem.
import { html, raw, $, toast } from './util.js';
import { state, user, isSupporter } from './store.js';
import { levelInfo, xpBreakdown, describe, XP } from './achievements.js';
import { EMBLEMS, emblemKey, emblemSvg } from './emblems.js';
import { openDialog, errMsg } from './ui.js';
import { updateProfile } from './api.js';

const num = (n) => Number(n || 0).toLocaleString('es-ES');

// Marco de Mecenas «moneda antigua»: aro con 24 cuentas doradas y filete interior (viewBox 100; el disco va debajo)
const BEADS = [...Array(24)].map((_, i) => {
  const a = (i * 15 * Math.PI) / 180;
  return `<circle cx="${(50 + 42 * Math.cos(a)).toFixed(1)}" cy="${(50 + 42 * Math.sin(a)).toFixed(1)}" r="2.6"/>`;
}).join('');
const COIN_FRAME = `<svg class="emblem-frame" viewBox="0 0 100 100" aria-hidden="true">
  <path fill-rule="evenodd" class="ef-rim" d="M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92ZM50 16a34 34 0 1 0 0 68a34 34 0 1 0 0-68Z"/>
  <g class="ef-beads">${BEADS}</g><circle class="ef-line" cx="50" cy="50" r="36.5" fill="none" stroke-width="3"/></svg>`;

/** Emblema en su círculo. ring: anillo de progreso (0-100). gold: marco de Mecenas. */
export function emblemBadge(key, { size = 'md', ring = null, gold = false, label = '' } = {}) {
  const style = ring === null ? '' : `--pct:${ring}`;
  return html`<span class="emblem emblem-${size} ${ring === null ? '' : 'has-ring'} ${gold ? 'is-gold' : ''}" style="${style}">
    ${gold ? raw(COIN_FRAME) : ''}${raw(emblemSvg(key, { label }))}</span>`;
}

/** Botón del distintivo (se vuelve a pintar con el evento «edm:xp»). */
export function heroChip() {
  if (!user()) return '';
  const info = levelInfo();
  return html`<button type="button" class="hero-chip" data-hero
      aria-label="Nivel ${info.level}, ${info.rank.name}. Ver tu progreso">
    <span class="hero-emblem">${raw(emblemBadge(state.profile?.emblem, { size: 'sm', ring: info.pct, gold: isSupporter() }))}
      <b class="hero-level" aria-hidden="true">${info.level}</b></span>
    <span class="hero-text" aria-hidden="true"><small>Nivel ${info.level}</small>${info.rank.name}</span>
  </button>`;
}

// Un único listener: cualquier distintivo de la vista abre la hoja, y se repinta al cambiar los PX o el emblema
document.addEventListener('click', (e) => { if (e.target.closest('[data-hero]')) heroSheet(); });
document.addEventListener('edm:xp', () => {
  document.querySelectorAll('[data-hero]').forEach((el) => { el.outerHTML = heroChip(); });
});

/** Hoja con el nivel, la barra de PX, de dónde salen, los últimos logros y accesos a Comunidad y emblema. */
export function heroSheet() {
  const info = levelInfo();
  const b = xpBreakdown();
  const last = [...state.achievements].sort((x, y) => String(y.earned_at).localeCompare(String(x.earned_at))).slice(0, 3);
  const name = state.profile?.display_name || user().email;
  return openDialog(html`
    <div class="sheet hero-sheet">
      <div class="hero-sheet-head">
        ${raw(emblemBadge(state.profile?.emblem, { size: 'lg', ring: info.pct, gold: isSupporter() }))}
        <div><p class="eyebrow">Nivel ${info.level}</p><h2 class="sheet-title">${info.rank.name}</h2><p class="muted small">${name}</p></div>
      </div>
      <span class="bar" role="img" aria-label="${info.xp} PX; el nivel ${info.level + 1} empieza en ${info.to} PX"><span style="width:${info.pct}%"></span></span>
      <p class="small"><strong>${num(info.xp)} PX</strong> · te faltan ${num(info.to - info.xp)} PX para el nivel ${info.level + 1}${info.rank.next
        ? ` y ${num(info.rank.toNext)} para ser ${info.rank.next.name}` : ''}.</p>
      <ul class="xp-list small">
        <li><span>${b.contributions.total} ${b.contributions.total === 1 ? 'aportación aceptada' : 'aportaciones aceptadas'} al catálogo</span><b>${num(b.contributions.total * XP.contribution)} PX</b></li>
        <li><span>${b.achievements} ${b.achievements === 1 ? 'logro' : 'logros'}</span><b>${num(b.achievements * XP.achievement)} PX</b></li>
        <li><span>${b.marks} ${b.marks === 1 ? 'partida' : 'partidas'} (jugadas o dirigidas)</span><b>${num(b.marks * XP.mark)} PX</b></li>
      </ul>
      <p class="muted small">Lo que más suma: proponer códigos al escanear, corregir datos y añadir libros que falten
        (${XP.contribution} PX cada aportación aceptada).</p>
      ${last.length ? raw(html`<h3 class="setting-title">Últimos logros</h3><ul class="hero-ach">${last.map((a) => {
        const d = describe(a.key, a);
        return raw(html`<li><strong>${d.title}</strong><small class="muted">${d.text}</small></li>`);
      })}</ul>`) : ''}
      <div class="actions hero-actions">
        <button class="btn btn-ghost" data-emblem>Cambiar emblema</button>
        <a class="btn btn-primary" href="#/comunidad" data-close>Ver la Comunidad</a>
      </div>
    </div>`, (d, close) => {
    $('[data-close]', d).onclick = () => close(true);
    $('[data-emblem]', d).onclick = async () => { close(true); await emblemDialog(); };
  });
}

/** Selector de emblema: guarda profiles.emblem y repinta distintivos y perfil. Resuelve con la clave o null. */
export async function emblemDialog() {
  const current = emblemKey(state.profile?.emblem);
  const key = await openDialog(html`
    <form class="sheet emblem-picker">
      <h2 class="sheet-title">Elige tu emblema</h2>
      <p class="muted small">Te representa en la app y, si lo activas, en la Comunidad.${isSupporter() ? ' Como Mecenas, lleva el marco de moneda antigua.' : ''}</p>
      <div class="emblem-grid" role="radiogroup" aria-label="Emblemas">
        ${Object.entries(EMBLEMS).map(([k, [label]]) => raw(html`<label class="emblem-opt" title="${label}">
          <input type="radio" name="emblem" value="${k}" ${k === current ? 'checked' : ''}>
          ${raw(emblemBadge(k, { size: 'md', gold: isSupporter(), label }))}</label>`))}
      </div>
      <p class="muted small">Iconos de <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>
        (Lorc y Delapouite, CC BY 3.0).</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button class="btn btn-primary">Guardar</button>
      </div>
    </form>`, (d, close) => {
    $('[data-cancel]', d).onclick = () => close(null);
    $('form', d).onsubmit = (e) => { e.preventDefault(); close(new FormData(e.target).get('emblem')); };
  });
  if (!key || key === current) return null;
  try {
    await updateProfile(user().id, { emblem: key });
    state.profile.emblem = key;
    document.dispatchEvent(new CustomEvent('edm:xp'));
    toast(`Emblema: ${EMBLEMS[key][0]}`, 'ok');
    return key;
  } catch (err) { toast(errMsg(err), 'error'); return null; }
}
