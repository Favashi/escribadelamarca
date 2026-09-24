// Iconos propios (SVG en línea, heredan el color del texto). Mismo trazo que los de la barra de pestañas.
const P = {
  star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z" fill="currentColor"/>',
  shield: '<path d="M12 3l7 3v5.2c0 4.5-3 8.3-7 9.8-4-1.5-7-5.3-7-9.8V6z" fill="currentColor"/><path d="M9 12l2 2 4-4" fill="none" stroke="var(--icon-cut, #fff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  warning: '<path d="M12 3.5L22 20H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  userX: '<circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20a7 7 0 0 1 11.5-5.4M16.5 15.5l4 4M20.5 15.5l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4.5a2.5 2.5 0 0 0 2.8 3.9M17 6h2.5a2.5 2.5 0 0 1-2.8 3.9M12 13v3M8.5 20h7M10 16h4l.5 4h-5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  quill: '<path d="M20 4c-6 1-11 5-13 12l-1.5 4M20 4c-1 5-4 9-9 11M20 4l-6 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  books: '<path d="M4 19V5h4v14zM10 19V4h4v15zM15.5 6.2l3.8-1 3.2 12.9-3.8 1zM3 20h18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  compass: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" fill="currentColor"/>',
  seal: '<circle cx="12" cy="12" r="8.5" fill="currentColor"/><path d="M14.5 8.8a3.5 3.5 0 1 0 0 6.4M8.8 12h4" fill="none" stroke="var(--icon-cut, #fff)" stroke-width="1.8" stroke-linecap="round"/>',
  chevron: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** <svg> de un icono. `label` lo hace accesible; sin él es decorativo. */
export function icon(name, { label = '', cls = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="i i-${name} ${cls}" viewBox="0 0 24 24" ${a11y}>${P[name] || ''}</svg>`;
}

/** Ribete diagonal de esquina para paneles de Mecenas o de administración. */
export function ribbon(kind) {
  return kind === 'admin'
    ? `<span class="ribbon ribbon-admin" aria-hidden="true">${icon('shield')}Admin</span>`
    : `<span class="ribbon ribbon-perk" aria-hidden="true">${icon('star')}Mecenas</span>`;
}
