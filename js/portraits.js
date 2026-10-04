// Retratos (personajes y monstruos) y escenas de partida para el perfil: dibujos a plumilla de Gordy Higgins (dominio
// público), recortados y convertidos en máscara (assets/retratos, assets/escenas). Como son máscaras, el acabado se
// elige por CSS sin más imágenes: color plano (por categoría), blanco y negro o invertido.
// El retrato se ve en grande (ficha del Perfil y perfil público); en lo pequeño sigue el emblema de icono.
// Algunos se ganan con logros; la misma regla está en el servidor (public.portrait_allowed).
import { html, raw, $, toast } from './util.js';
import { state, user } from './store.js';
import { openDialog, errMsg } from './ui.js';
import { updateProfile } from './api.js';
import { RANKS } from './achievements.js';

export const PORTRAIT_CATS = { raza: 'Razas', prof: 'Profesiones', mon: 'Monstruos' };

export const PORTRAITS = {
  elfa: ['Elfa', 'raza'], enano: ['Enano', 'raza'], 'enano-escudo': ['Enano del escudo', 'raza'],
  mediano: ['Mediano', 'raza'], 'mediano-queso': ['Mediano glotón', 'raza'],
  clerigo: ['Clérigo', 'prof'], guerrero: ['Guerrero', 'prof'], barbaro: ['Bárbaro', 'prof'], ladron: ['Ladrón', 'prof'],
  hechicero: ['Hechicero', 'prof'], paladin: ['Paladín', 'prof'], acrobata: ['Acróbata', 'prof'], mercader: ['Mercader', 'prof'],
  contemplador: ['Contemplador', 'mon', 'explorer'], ogro: ['Ogro', 'mon'], liche: ['Liche', 'mon', 'rank:3'],
  vampiro: ['Siervo vampiro', 'mon'], kobolds: ['Kobolds', 'mon'], esqueletos: ['Esqueletos', 'mon'],
};

export const SCENES = {
  trol: 'Pelea con el trol', taberna: 'Pelea de taberna', ritual: 'Ritual', cerradura: 'Forzar la cerradura',
  'golpe-elfo': 'Golpe élfico', 'conjuro-fallido': 'Conjuro fallido', 'guardia-orca': 'La guardia orca', pozo: 'Al fondo del pozo',
};

export const PORTRAIT_STYLES = [['color', 'Color'], ['bn', 'Blanco y negro'], ['inv', 'Invertido']];

/** URL absoluta de un recurso: las relativas dentro de variables CSS se resolverían desde la hoja de estilos. */
const asset = (path) => new URL(path, document.baseURI).href;

const UNLOCK_TEXT = { explorer: 'Consigue el logro Explorador de la Frontera', 'rank:3': `Alcanza el rango ${RANKS[3].name}` };

/** ¿Puede usar este retrato? (los de logro, solo con el logro). */
export function portraitUnlocked(key, achievements = state.achievements) {
  const need = PORTRAITS[key]?.[2];
  return !need || achievements.some((a) => a.key === need);
}

/** Retrato redondo (máscara de tinta sobre disco). Usa las clases del emblema para tamaños y anillos. */
export function portraitHtml(key, { style = 'color', size = 'lg', label = '' } = {}) {
  const p = PORTRAITS[key];
  if (!p) return '';
  return html`<span class="emblem emblem-${size} portrait pt-${style} pt-${p[1]}" role="img" aria-label="${label || p[0]}"
    style="--pt-img:url('${asset(`assets/retratos/${key}.webp`)}')"></span>`;
}

/** Escena como imagen de máscara (para la cabecera del perfil público). */
export const sceneUrl = (key) => (SCENES[key] ? asset(`assets/escenas/${key}.webp`) : null);

/** Selector de retrato: grupos por categoría, acabado y «sin retrato» (usa el emblema). Resuelve true si guarda. */
export async function portraitDialog({ onEmblem } = {}) {
  const p = state.profile ?? {};
  const style = p.portrait_style || 'color';
  const result = await openDialog(html`
    <form class="sheet portrait-picker">
      <h2 class="sheet-title">Tu retrato</h2>
      <p class="muted small">Se ve en grande en tu Perfil y en tu perfil público. En lo pequeño (arriba, en la Comunidad) sigue tu emblema.</p>
      <div class="seg pt-styles" role="radiogroup" aria-label="Acabado">
        ${PORTRAIT_STYLES.map(([id, label]) => raw(html`<label><input type="radio" name="style" value="${id}" ${style === id ? 'checked' : ''}><span>${label}</span></label>`))}
      </div>
      <div class="pt-grid" data-style="${style}">
        <label class="pt-opt pt-none" title="Sin retrato"><input type="radio" name="portrait" value="" ${p.portrait ? '' : 'checked'}>
          <span class="pt-none-ic" aria-hidden="true">—</span><small>Sin retrato</small></label>
        ${Object.entries(PORTRAIT_CATS).map(([cat, catName]) => raw(html`<p class="pt-cat">${catName}</p>
          ${Object.entries(PORTRAITS).filter(([, v]) => v[1] === cat).map(([k, [name, , need]]) => {
            const ok = portraitUnlocked(k);
            return raw(html`<label class="pt-opt ${ok ? '' : 'locked'}" title="${ok ? name : UNLOCK_TEXT[need]}">
              <input type="radio" name="portrait" value="${k}" ${p.portrait === k ? 'checked' : ''} ${ok ? '' : 'disabled'}>
              ${raw(portraitHtml(k, { style, size: 'md', label: name }))}<small>${name}</small>${ok ? '' : raw('<b class="pt-lock">Bloqueado</b>')}</label>`);
          })}`))}
      </div>
      <p class="muted small">Dibujos de Gordy Higgins (dominio público).</p>
      <div class="actions">
        ${onEmblem ? raw('<button type="button" class="btn btn-ghost" data-emblem>Cambiar emblema</button>') : ''}
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button class="btn btn-primary">Guardar</button>
      </div>
    </form>`, (d, close) => {
    const grid = $('.pt-grid', d);
    d.querySelectorAll('input[name=style]').forEach((r) => r.addEventListener('change', () => {
      grid.querySelectorAll('.portrait').forEach((el) => { el.classList.remove('pt-color', 'pt-bn', 'pt-inv'); el.classList.add(`pt-${r.value}`); });
    }));
    $('[data-cancel]', d).onclick = () => close(null);
    $('[data-emblem]', d)?.addEventListener('click', () => close('emblem'));
    $('form', d).onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      close({ portrait: f.get('portrait') || null, portrait_style: f.get('style') || 'color' });
    };
  });
  if (result === 'emblem') { await onEmblem?.(); return true; }
  if (!result || (result.portrait === (p.portrait ?? null) && result.portrait_style === style)) return false;
  try {
    await updateProfile(user().id, result);
    Object.assign(state.profile, result);
    toast(result.portrait ? `Retrato: ${PORTRAITS[result.portrait][0]}` : 'Sin retrato: se usa tu emblema', 'ok');
    return true;
  } catch (err) { toast(errMsg(err), 'error'); return false; }
}
