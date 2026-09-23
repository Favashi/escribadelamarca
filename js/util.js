// Helpers de DOM y formato.

import { settings } from './settings.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Plantilla que escapa los valores interpolados. Usa raw() para insertar HTML de confianza. */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i >= values.length) return out + s;
    const v = values[i];
    const str = Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.v : esc(x))).join('')
      : v instanceof Raw ? v.v
      : v === false || v == null ? ''
      : esc(v);
    return out + s + str;
  }, '');
}
class Raw { constructor(v) { this.v = v; } }
export const raw = (v) => new Raw(v);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDate = (d) => (d ? dateFmt.format(new Date(d)) : '');
export const fmtShort = (d) => (d ? shortFmt.format(new Date(d)) : '');

export function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function initials(title) {
  return String(title ?? '?').replace(/[—–-].*$/, '').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

/** Portada o placeholder con iniciales. */
export function cover(book, cls = '') {
  return book.cover_url && settings.covers_enabled
    ? html`<img class="cover ${cls}" src="${book.cover_url}" alt="" loading="lazy">`
    : html`<div class="cover cover-ph ${cls}" aria-hidden="true"><span>${initials(book.title)}</span></div>`;
}

export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
