// Temas: auto (sistema), claro, oscuro y pergamino (Mecenas).
const KEY = 'edm.theme';

export const THEMES = [
  { id: 'auto', label: 'Automático' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'parchment', label: 'Pergamino', supporter: true },
  { id: 'retro', label: 'Retro EGA', supporter: true },
];

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(id, save = false) {
  const root = document.documentElement;
  if (id === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = id;
  if (save) { try { localStorage.setItem(KEY, id); } catch { /* sin storage */ } }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg || '#7a1f1f');
}

/** Aplica el tema guardado; si es de Mecenas y el usuario ya no lo es, vuelve a automático. */
export function restoreTheme(isSupporter) {
  const t = getTheme();
  const def = THEMES.find((x) => x.id === t);
  applyTheme(!def || (def.supporter && !isSupporter) ? 'auto' : t);
}

// Tamaño de letra: escala el rem de la raíz (casi todos los tamaños de la app van en rem).
const TEXT_KEY = 'edm.textSize';

export const TEXT_SIZES = [
  { id: 's', label: 'Pequeña', scale: 0.9375 },
  { id: 'm', label: 'Normal', scale: 1 },
  { id: 'l', label: 'Grande', scale: 1.125 },
  { id: 'xl', label: 'Muy grande', scale: 1.25 },
];

export function getTextSize() {
  try { return localStorage.getItem(TEXT_KEY) || 'm'; } catch { return 'm'; }
}

export function applyTextSize(id, save = false) {
  const size = TEXT_SIZES.find((t) => t.id === id) ?? TEXT_SIZES[1];
  document.documentElement.style.setProperty('--text-scale', String(size.scale));
  if (save) { try { localStorage.setItem(TEXT_KEY, size.id); } catch { /* sin storage */ } }
}
