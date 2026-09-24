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
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.9.6 1.6 0 2.5M11.5 3.5c-.6.9.6 1.6 0 2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.7a4.9 4.9 0 0 1-.5 9.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  people: '<circle cx="8.5" cy="8.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="16.5" cy="9.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M2.5 19.5a6 6 0 0 1 12 0M14.5 14.2a5 5 0 0 1 7 4.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  torch: '<path d="M8 3h8v4l-2 3v10a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V10L8 7zM8 7h8M12 13v2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  dice: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7l4.2 7.4H7.8zM4 7.4L12 7l8 .4M7.8 14.4L4 16.6M16.2 14.4l3.8 2.2M7.8 14.4L12 21.2l4.2-6.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2M9 9h4.5M9 12.5h4.5M9 16h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  user: '<circle cx="12" cy="8.5" r="4" fill="currentColor"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0z" fill="currentColor"/>',
  wave: '<path d="M8 13.5V6.8a1.4 1.4 0 0 1 2.8 0V12M10.8 11V5.4a1.4 1.4 0 0 1 2.8 0V11M13.6 11V6.4a1.4 1.4 0 0 1 2.8 0v6.8M16.4 10.6a1.4 1.4 0 0 1 2.8 0v3.6A6.8 6.8 0 0 1 12.4 21h-.6a6.2 6.2 0 0 1-4.9-2.4L4.2 15a1.5 1.5 0 0 1 2.3-1.9L8 14.6M4 6.5A5 5 0 0 1 6.2 3.8M19.5 3.5a5 5 0 0 1 1.3 2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M7.5 10h9M7.5 13h5.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  bug: '<rect x="7.5" y="7" width="9" height="13" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9 7.5a3 3 0 0 1 6 0M12 11v9M3.5 12h4M16.5 12h4M4.5 7.5l3.2 2M19.5 7.5l-3.2 2M4.5 18.5l3.2-2M19.5 18.5l-3.2-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  bulb: '<path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17.5h5.2V15.8c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2" fill="currentColor"/>',
  shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.8 0 3-1.2 4-2.9M13.5 9.9c1-1.7 2.2-2.9 4-2.9H21M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  bookOpen: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  screen: '<path d="M3 7l5-1.5v13L3 20zM8 5.5l8 0v13l-8 0zM16 5.5l5 1.5v13l-5-1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.5 9.5h3M10.5 12.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  text: '<path d="M3 19l4.5-12h1L13 19M4.6 15h6.8M14.5 19l3.2-8h.6l3.2 8M15.5 16.5h4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
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
