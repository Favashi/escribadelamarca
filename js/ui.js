// Componentes compartidos: diálogos, formulario de libro, cabecera de vista.
import { html, raw, esc, $ } from './util.js';
import { state } from './store.js';
import { normalizeCode } from './isbn.js';
import { APP_VERSION, RELEASES } from './version.js';

const dialog = () => document.getElementById('dialog');

/** Abre el <dialog> con contenido HTML. Devuelve la promesa resuelta por close(value). */
function openDialog(content, bind) {
  const d = dialog();
  d.innerHTML = content;
  return new Promise((resolve) => {
    const close = (value) => { d.close(); resolve(value); };
    d.onclose = () => resolve(null);
    d.onclick = (e) => { if (e.target === d) close(null); }; // clic en el fondo
    bind(d, close);
    d.showModal();
  });
}

export function confirmDialog(message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return openDialog(html`
    <div class="sheet">
      <p class="sheet-msg">${message}</p>
      <div class="actions">
        <button class="btn btn-ghost" data-v="0">${cancel}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1">${ok}</button>
      </div>
    </div>`, (d, close) => {
    d.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => close(b.dataset.v === '1')));
  });
}

export const CONDITIONS = ['Precintado', 'Como nuevo', 'Muy bueno', 'Bueno', 'Usado', 'Deteriorado'];

/**
 * Formulario de alta/edición de libro. Resuelve con { fields, barcode } o null.
 * withBarcode: muestra el campo de código de barras (solo en altas).
 */
export function bookFormDialog({ initial = {}, heading = 'Nuevo libro', submit = 'Guardar', note = '', withBarcode = false, barcode = '' } = {}) {
  const cats = state.categories;
  const defaultCat = initial.category_id ?? cats.find((c) => c.slug === 'aventuras')?.id;
  return openDialog(html`
    <form class="sheet form" method="dialog" novalidate>
      <h2 class="sheet-title">${heading}</h2>
      ${note ? raw(`<p class="muted small">${esc(note)}</p>`) : ''}
      <label>Título
        <input name="title" required maxlength="200" value="${initial.title ?? ''}" autocomplete="off">
      </label>
      <div class="row2">
        <label>Código de publicación <input name="code" maxlength="12" value="${initial.code ?? ''}" placeholder="B19, G0…" autocomplete="off" autocapitalize="characters"></label>
        <label>Categoría
          <select name="category_id">
            ${cats.map((c) => raw(html`<option value="${c.id}" ${c.id === defaultCat ? 'selected' : ''}>${c.name}</option>`))}
          </select>
        </label>
      </div>
      ${withBarcode ? raw(html`<label>Código de barras
        <input name="barcode" inputmode="numeric" value="${barcode}" placeholder="978…" autocomplete="off">
      </label>`) : ''}
      <div class="row2">
        <label>Autor <input name="author" maxlength="200" value="${initial.author ?? ''}"></label>
        <label>Páginas <input name="pages" maxlength="80" value="${initial.pages ?? ''}"></label>
      </div>
      <label>URL de portada
        <input name="cover_url" type="url" value="${initial.cover_url ?? ''}" placeholder="https://…">
      </label>
      <label>Descripción
        <textarea name="description" rows="3">${initial.description ?? ''}</textarea>
      </label>
      <p class="form-error" hidden></p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" class="btn btn-primary">${submit}</button>
      </div>
    </form>`, (d, close) => {
    const form = $('form', d);
    const err = $('.form-error', d);
    $('[data-cancel]', d).onclick = () => close(null);
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const title = f.title.trim();
      if (!title) return showErr('El título es obligatorio.');
      let code = null;
      if (f.barcode?.trim()) {
        code = normalizeCode(f.barcode);
        if (!code) return showErr('El código de barras no es válido (revisa los dígitos).');
      }
      const pubCode = f.code.trim().toUpperCase();
      const m = pubCode.match(/^([A-Z]+)(\d*)$/);
      close({
        fields: {
          title,
          code: pubCode || null,
          series: m ? m[1] : null,
          number: m && m[2] ? Number(m[2]) : null,
          category_id: Number(f.category_id) || null,
          author: f.author.trim() || null,
          pages: f.pages.trim() || null,
          cover_url: f.cover_url.trim() || null,
          description: f.description.trim() || null,
        },
        barcode: code,
      });
    };
    function showErr(msg) { err.textContent = msg; err.hidden = false; }
    setTimeout(() => $('input[name=title]', d).focus(), 50);
  });
}

export function viewHeader(title, sub = '', extra = '') {
  return html`<header class="view-head">
    <div><h1>${title}</h1>${sub ? raw(`<p class="muted">${esc(sub)}</p>`) : ''}</div>
    ${raw(extra)}
  </header>`;
}

/** Traduce errores de Supabase a mensajes legibles. */
export function errMsg(e) {
  if (e?.code === '23505') return e.message?.includes('barcodes') ? 'Ese código ya está asignado a ese libro.' : 'Ya existe.';
  if (e?.code === '42501') return 'No tienes permiso para esta acción.';
  return e?.message || 'Algo ha fallado. Inténtalo de nuevo.';
}

const SEEN_KEY = 'edm.seenVersion';
const releaseDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/** Diálogo con las notas de versión (todas, o solo las más recientes que `since`). */
export function releaseNotesDialog({ releases = RELEASES, heading = 'Novedades' } = {}) {
  return openDialog(html`
    <div class="sheet">
      <h2 class="sheet-title">${heading}</h2>
      <div class="releases">
        ${releases.map((r) => raw(html`<section class="release">
          <h3>Versión ${r.version} <small>${releaseDate.format(new Date(r.date))}</small></h3>
          <ul>${r.notes.map((n) => raw(html`<li>${n}</li>`))}</ul>
        </section>`))}
      </div>
      <div class="actions"><button class="btn btn-primary" data-close>Entendido</button></div>
    </div>`, (d, close) => { $('[data-close]', d).onclick = () => close(true); });
}

const cmpVersion = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** Muestra una vez las novedades tras una actualización. Los usuarios nuevos no las ven. */
export function showWhatsNewIfUpdated() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { return; }
  if (!seen || cmpVersion(APP_VERSION, seen) <= 0) return;
  const fresh = RELEASES.filter((r) => cmpVersion(r.version, seen) > 0);
  if (fresh.length) releaseNotesDialog({ releases: fresh, heading: `Novedades de la versión ${APP_VERSION}` });
}
