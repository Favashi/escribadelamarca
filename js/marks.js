// Marcas rápidas por libro: Leída, Jugada y Dirigida (tabla book_marks). Para todos y para cualquier libro, lo tengas o
// no; no cuentan como «tenerlo». Se guardan como fecha (cuándo se marcó); null = sin marcar.
// El diario de partidas de Mecenas marca solo Jugada o Dirigida (trigger en la base de datos).
import { html, raw } from './util.js';
import { state, user } from './store.js';
import { supabase } from './supabase.js';
import { icon } from './icons.js';

export const MARKS = [
  { key: 'read_at', label: 'Leída', icon: 'bookOpen' },
  { key: 'played_at', label: 'Jugada', icon: 'dice' },
  { key: 'directed_at', label: 'Dirigida', icon: 'screen' },
];

export const marksOf = (bookId) => state.marks.get(bookId) || {};
export const hasMark = (bookId, key) => !!marksOf(bookId)[key];

/** Iconos pequeños de las marcas de un libro (para tarjetas y filas). '' si no tiene ninguna. */
export function markIcons(bookId) {
  const m = marksOf(bookId);
  const on = MARKS.filter((k) => m[k.key]);
  if (!on.length) return '';
  return html`<span class="mark-icons" aria-label="${on.map((k) => k.label).join(', ')}">${on.map((k) =>
    raw(html`<span title="${k.label}">${raw(icon(k.icon))}</span>`))}</span>`;
}

/** Texto para lectores de pantalla y títulos: «leída, jugada». */
export const markText = (bookId) => MARKS.filter((k) => hasMark(bookId, k.key)).map((k) => k.label.toLowerCase()).join(', ');

/** Botones de la ficha: se activan y desactivan con un toque. */
export function markButtons(bookId) {
  return html`<div class="mark-buttons" role="group" aria-label="Tu historial con este libro">${MARKS.map((k) => {
    const on = hasMark(bookId, k.key);
    return raw(html`<button type="button" class="mark-btn ${on ? 'on' : ''}" data-mark-key="${k.key}" aria-pressed="${String(on)}">
      ${raw(icon(k.icon))}<span>${k.label}</span></button>`);
  })}</div>`;
}

/** Activa o desactiva una marca. Devuelve la fila actualizada. */
export async function toggleMark(bookId, key) {
  const current = marksOf(bookId);
  const row = { user_id: user().id, catalog_id: bookId, ...current, [key]: current[key] ? null : new Date().toISOString(),
    updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('book_marks').upsert(row, { onConflict: 'user_id,catalog_id' }).select().single();
  if (error) throw error;
  state.marks.set(bookId, data);
  return data;
}

/** Carga las marcas del usuario en state.marks. */
export async function loadMarks(uid) {
  const { data, error } = await supabase.from('book_marks').select('*').eq('user_id', uid);
  if (error) throw error;
  state.marks = new Map(data.map((r) => [r.catalog_id, r]));
}
