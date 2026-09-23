import { html } from './util.js';
import { settings } from './settings.js';

/** Franja de aviso general (Admin → Ajustes). Se puede cerrar; vuelve a salir si cambia el texto. */
export function renderAnnouncement() {
  document.querySelector('.announcement')?.remove();
  const a = settings.announcement;
  if (!a?.enabled || !a.text?.trim()) return;
  const key = `edm.ann.${[...a.text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)}`;
  try { if (localStorage.getItem(key)) return; } catch { /* sin storage */ }
  const bar = document.createElement('div');
  bar.className = `announcement announcement-${['info', 'warn', 'ok'].includes(a.level) ? a.level : 'info'}`;
  bar.setAttribute('role', 'status');
  bar.innerHTML = html`<span>${a.text}</span><button type="button" aria-label="Cerrar aviso">×</button>`;
  bar.querySelector('button').onclick = () => {
    try { localStorage.setItem(key, '1'); } catch { /* sin storage */ }
    bar.remove();
  };
  document.body.prepend(bar);
}

