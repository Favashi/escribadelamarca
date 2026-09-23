// Lista de navegación: la vista que abre una ficha (biblioteca, series, catálogo, buscador) guarda el orden
// en que muestra los libros, y la ficha permite ir al anterior/siguiente de esa lista (botones o swipe).
const KEY = 'edm.navlist';

export function setNavList(ids, label) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ids: [...new Set(ids)], label })); } catch { /* sin storage */ }
}

/** { prev, next, index, total, label } para el libro actual, o null si no viene de una lista. */
export function neighbors(id) {
  try {
    const nav = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    const i = nav?.ids?.indexOf(id) ?? -1;
    if (i < 0) return null;
    return { prev: nav.ids[i - 1] ?? null, next: nav.ids[i + 1] ?? null, index: i, total: nav.ids.length, label: nav.label };
  } catch { return null; }
}

/**
 * Detecta swipe horizontal en `el`. Ignora gestos que empiezan en campos de formulario
 * o que son sobre todo verticales (scroll).
 */
export function onSwipe(el, { left, right }) {
  let x0 = null, y0 = null, t0 = 0;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, textarea, select, .tiles, .chips')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    (dx < 0 ? left : right)?.();
  }, { passive: true });
}
