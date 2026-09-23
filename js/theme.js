// Temas: auto (sistema), claro, oscuro y pergamino (Mecenas).
const KEY = 'edm.theme';

export const THEMES = [
  { id: 'auto', label: 'Automático' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'parchment', label: 'Pergamino', supporter: true },
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
