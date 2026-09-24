// Componentes compartidos: diálogos, formulario de libro, cabecera de vista.
import { html, raw, esc, $ } from './util.js';
import { state } from './store.js';
import { normalizeCode } from './isbn.js';
import { APP_VERSION, RELEASES } from './version.js';
import { icon } from './icons.js';

const dialog = () => document.getElementById('dialog');

/** Abre el <dialog> con contenido HTML. Devuelve la promesa resuelta por close(value). */
function openDialog(content, bind) {
  const d = dialog();
  d.innerHTML = content;
  return new Promise((resolve) => {
    const close = (value) => { resolve(value); d.close(); };
    // Si se abre un diálogo justo después de cerrar otro, el evento «close» del anterior llega tarde,
    // cuando este ya está abierto: se ignora (un cierre real deja d.open en false).
    d.onclose = () => { if (!d.open) resolve(null); };
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
      <fieldset class="game-fields">
        <legend>Datos de juego</legend>
        <div class="row2">
          <label>Nivel mín. <input name="min_level" type="number" inputmode="numeric" min="0" max="36" value="${initial.min_level ?? ''}"></label>
          <label>Nivel máx. <input name="max_level" type="number" inputmode="numeric" min="0" max="36" value="${initial.max_level ?? ''}"></label>
        </div>
        <div class="row2">
          <label>Jugadores mín. <input name="min_players" type="number" inputmode="numeric" min="1" max="12" value="${initial.min_players ?? ''}"></label>
          <label>Jugadores máx. <input name="max_players" type="number" inputmode="numeric" min="1" max="12" value="${initial.max_players ?? ''}"></label>
        </div>
        <div class="row2">
          <label>Sesiones <input name="sessions" type="number" inputmode="numeric" min="1" max="99" value="${initial.sessions ?? ''}"></label>
          <label>Etiquetas <input name="tags" value="${(initial.tags || []).join(', ')}" placeholder="Dungeon, Exploración"></label>
        </div>
      </fieldset>
      <fieldset class="game-fields">
        <legend>Ficha editorial</legend>
        <div class="row2">
          <label>Fecha de publicación <input name="catalog_date" type="date" value="${initial.catalog_date ?? ''}"></label>
          <label>PVP (€) <input name="price_eur" inputmode="decimal" value="${initial.price_eur != null ? String(initial.price_eur).replace('.', ',') : ''}" placeholder="12,95"></label>
        </div>
        <label>Formato <input name="binding" maxlength="80" value="${initial.binding ?? ''}" placeholder="Grapado, tapa blanda, PDF…"></label>
        <label>Resumen <textarea name="summary" rows="3" maxlength="1000">${initial.summary ?? ''}</textarea></label>
        <p class="muted small">La fecha de publicación decide cuándo sale como «Nuevo» (45 días).</p>
      </fieldset>
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
      const price = f.price_eur.trim() ? Number(f.price_eur.trim().replace(',', '.')) : null;
      if (price !== null && !(price >= 0 && price < 10000)) return showErr('El PVP no es válido (ej. 12,95).');
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
          min_level: int(f.min_level), max_level: int(f.max_level),
          min_players: int(f.min_players), max_players: int(f.max_players),
          sessions: int(f.sessions),
          tags: [...new Set(f.tags.split(',').map((t) => t.trim()).filter(Boolean))],
          cover_url: f.cover_url.trim() || null,
          description: f.description.trim() || null,
          catalog_date: f.catalog_date || null,
          price_eur: price,
          binding: f.binding.trim() || null,
          summary: f.summary.trim() || null,
        },
        barcode: code,
      });
    };
    function showErr(msg) { err.textContent = msg; err.hidden = false; }
    function int(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
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

/** Etiqueta para funciones de Mecenas y para acciones de administración. */
export const PERK_TAG = `<span class="perk-tag" title="Extra de Mecenas">${icon('star')}Mecenas</span>`;
export const ADMIN_TAG = `<span class="admin-tag" title="Solo administradores">${icon('shield')}Admin</span>`;

/** Nombres legibles de los campos del catálogo (sugerencias, historial). */
export const FIELD_LABELS = {
  title: 'Título', code: 'Código', author: 'Autor', pages: 'Páginas', category_id: 'Categoría',
  min_level: 'Nivel mínimo', max_level: 'Nivel máximo', min_players: 'Jugadores mín.', max_players: 'Jugadores máx.',
  sessions: 'Sesiones', tags: 'Etiquetas', summary: 'Resumen', description: 'Descripción', cover_url: 'Portada',
  status: 'Estado', verified: 'Verificado', price_eur: 'PVP', kind: 'Tipo', binding: 'Formato',
  catalog_date: 'Fecha de publicación',
};
const SUGGESTABLE = ['title', 'code', 'author', 'pages', 'min_level', 'max_level', 'min_players', 'max_players', 'sessions', 'tags', 'summary'];
const INT_FIELDS = new Set(['min_level', 'max_level', 'min_players', 'max_players', 'sessions']);

/** Texto legible de un valor de campo. */
export function fieldText(field, value) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'category_id') return state.categories.find((c) => c.id === value)?.name ?? String(value);
  if (field === 'verified') return value ? 'sí' : 'no';
  return String(value);
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Diferencias entre dos versiones de un registro: [{ field, label, from, to }] */
export function diffFields(oldRow = {}, newRow = {}) {
  return Object.keys(FIELD_LABELS)
    .filter((f) => (f in (oldRow || {}) || f in (newRow || {})) && !same(oldRow?.[f], newRow?.[f]))
    .map((f) => ({ field: f, label: FIELD_LABELS[f], from: fieldText(f, oldRow?.[f]), to: fieldText(f, newRow?.[f]) }));
}

/** Formulario «Sugerir cambios»: devuelve { changes, note } solo con lo que el usuario ha cambiado, o null. */
export function suggestDialog(book) {
  const v = (f) => (Array.isArray(book[f]) ? book[f].join(', ') : book[f] ?? '');
  return openDialog(html`
    <form class="sheet form" novalidate>
      <h2 class="sheet-title">Sugerir cambios</h2>
      <p class="muted small">Corrige lo que esté mal o falte. Un administrador lo revisará antes de aplicarlo.</p>
      <label>Título <input name="title" maxlength="200" value="${v('title')}"></label>
      <div class="row2">
        <label>Código <input name="code" maxlength="12" value="${v('code')}" autocapitalize="characters"></label>
        <label>Páginas <input name="pages" maxlength="80" value="${v('pages')}"></label>
      </div>
      <label>Autor <input name="author" maxlength="200" value="${v('author')}"></label>
      <fieldset class="game-fields">
        <legend>Datos de juego</legend>
        <div class="row2">
          <label>Nivel mín. <input name="min_level" type="number" inputmode="numeric" min="0" max="36" value="${v('min_level')}"></label>
          <label>Nivel máx. <input name="max_level" type="number" inputmode="numeric" min="0" max="36" value="${v('max_level')}"></label>
        </div>
        <div class="row2">
          <label>Jugadores mín. <input name="min_players" type="number" inputmode="numeric" min="1" max="12" value="${v('min_players')}"></label>
          <label>Jugadores máx. <input name="max_players" type="number" inputmode="numeric" min="1" max="12" value="${v('max_players')}"></label>
        </div>
        <div class="row2">
          <label>Sesiones <input name="sessions" type="number" inputmode="numeric" min="1" max="99" value="${v('sessions')}"></label>
          <label>Etiquetas <input name="tags" value="${v('tags')}" placeholder="Dungeon, Exploración"></label>
        </div>
        <label>Resumen <textarea name="summary" rows="3" maxlength="1000">${v('summary')}</textarea></label>
      </fieldset>
      <label>¿De dónde sale el dato? (opcional) <input name="note" maxlength="500" placeholder="Lo pone en la contraportada, en la web de la editorial…"></label>
      <p class="form-error" hidden></p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" class="btn btn-primary">Enviar sugerencia</button>
      </div>
    </form>`, (d, close) => {
    const form = $('form', d);
    const err = $('.form-error', d);
    $('[data-cancel]', d).onclick = () => close(null);
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const changes = {};
      for (const field of SUGGESTABLE) {
        let val = (f[field] ?? '').trim();
        if (field === 'code') val = val.toUpperCase();
        if (INT_FIELDS.has(field)) val = val === '' ? null : parseInt(val, 10);
        else if (field === 'tags') val = [...new Set(val.split(',').map((t) => t.trim()).filter(Boolean))];
        else val = val || null;
        if (!same(val, book[field] ?? (field === 'tags' ? [] : null))) changes[field] = val;
      }
      if (!Object.keys(changes).length) { err.textContent = 'No has cambiado ningún dato.'; err.hidden = false; return; }
      if ('title' in changes && !changes.title) { err.textContent = 'El título no puede quedar vacío.'; err.hidden = false; return; }
      close({ changes, note: f.note.trim() });
    };
  });
}

// Ilustraciones de la bienvenida: estilo «mini-portada» de módulo (morado + dorado), iguales en todos los temas
const OB_GOLD = '#f3c02f';
const OB_ART = {
  // Código de barras dentro del visor, con la línea roja del escáner
  scan: `<svg viewBox="0 0 64 64"><g fill="none" stroke="${OB_GOLD}" stroke-width="3" stroke-linecap="round">
      <path d="M10 20v-8a2 2 0 0 1 2-2h8M44 10h8a2 2 0 0 1 2 2v8M54 44v8a2 2 0 0 1-2 2h-8M20 54h-8a2 2 0 0 1-2-2v-8"/>
      <path d="M20 22v20M25 22v20M31 22v20M35 22v20M40 22v20M45 22v20" stroke-width="2.4"/></g>
      <path d="M14 32h36" stroke="#ff5a4a" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  // Casillas de una serie: unas conseguidas (doradas) y otras por conseguir (discontinuas)
  series: `<svg viewBox="0 0 64 64"><g stroke="${OB_GOLD}" stroke-width="2.2">
      <rect x="9" y="12" width="13" height="17" rx="2" fill="${OB_GOLD}"/><rect x="25.5" y="12" width="13" height="17" rx="2" fill="${OB_GOLD}"/>
      <rect x="42" y="12" width="13" height="17" rx="2" fill="none" stroke-dasharray="3 2.4"/>
      <rect x="9" y="35" width="13" height="17" rx="2" fill="${OB_GOLD}"/><rect x="25.5" y="35" width="13" height="17" rx="2" fill="none" stroke-dasharray="3 2.4"/>
      <rect x="42" y="35" width="13" height="17" rx="2" fill="${OB_GOLD}"/></g></svg>`,
  // Dado de veinte caras: hexágono exterior, cara central con el 20 y aristas hacia los vértices
  d20: `<svg viewBox="0 0 64 64"><g fill="none" stroke="${OB_GOLD}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M32 5l23 13.3v27.4L32 59 9 45.7V18.3z"/>
      <path d="M32 17L15 44h34z"/>
      <path d="M32 5v12M9 18.3L32 17l23 1.3M9 18.3L15 44M55 18.3L49 44M9 45.7L15 44M55 45.7L49 44M15 44l17 15 17-15"/></g>
      <text x="32" y="38.5" text-anchor="middle" font-size="11" font-weight="700" fill="${OB_GOLD}" font-family="Cinzel, Georgia, serif">20</text></svg>`,
};

/** Bienvenida para usuarios nuevos (3 pasos). Resuelve con 'scan', 'catalog' o null. */
export function onboardingDialog() {
  const steps = [
    [OB_ART.scan, 'Escanea tus libros', 'Apunta la cámara al código de barras de la contraportada y el libro se añade a tu biblioteca. Los módulos antiguos sin código se buscan por el de la portada (B1, X2…).'],
    [OB_ART.series, 'Mira qué te falta', 'En «Mi biblioteca», la vista «Por series» te enseña los huecos de cada serie: «te faltan B7, B13…».'],
    [OB_ART.d20, 'Busca tu próxima aventura', 'La pestaña «Aventuras» filtra por nivel del grupo, jugadores y tipo de partida, entre lo que tienes o en todo el catálogo.'],
  ];
  let i = 0;
  return openDialog('<div class="sheet onboarding"></div>', (d, close) => {
    const box = $('.onboarding', d);
    const draw = () => {
      const [art, title, text] = steps[i];
      const last = i === steps.length - 1;
      box.innerHTML = html`
        <button type="button" class="ob-close" data-v="skip" aria-label="Cerrar la bienvenida">×</button>
        <div class="ob-art" aria-hidden="true">${raw(art)}</div>
        <h2 class="sheet-title">${title}</h2>
        <p>${text}</p>
        <div class="ob-dots" aria-label="Paso ${i + 1} de ${steps.length}">${steps.map((_, j) => raw(`<span class="${j === i ? 'on' : ''}"></span>`))}</div>
        <div class="actions">
          ${last ? raw(`<button class="btn btn-ghost" data-v="catalog">Ver el catálogo</button><button class="btn btn-primary" data-v="scan">${icon('camera')} Escanear mi primer libro</button>`)
            : raw('<button class="btn btn-ghost" data-v="skip">Saltar</button><button class="btn btn-primary" data-next>Siguiente</button>')}
        </div>
        <p class="ob-help small"><button type="button" class="link" data-v="help">${raw(icon('help'))} ¿Dudas? Consulta la ayuda</button></p>`;
      box.querySelector('[data-next]')?.addEventListener('click', () => { i += 1; draw(); });
      box.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => close(b.dataset.v === 'skip' ? null : b.dataset.v)));
    };
    draw();
  });
}

/** Confirmación fuerte para acciones irreversibles: hay que escribir `word` para habilitar el botón. */
export function typeToConfirmDialog(message, { word = 'ELIMINAR', ok = 'Eliminar' } = {}) {
  return openDialog(html`
    <form class="sheet form" novalidate>
      <h2 class="sheet-title danger-title">${raw(icon('warning'))} ¿Seguro?</h2>
      <p class="sheet-msg">${message}</p>
      <label>Escribe <strong>${word}</strong> para confirmar
        <input name="word" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" class="btn btn-danger" disabled>${ok}</button>
      </div>
    </form>`, (d, close) => {
    const form = $('form', d);
    const submit = $('[type=submit]', d);
    $('[data-cancel]', d).onclick = () => close(false);
    form.word.addEventListener('input', () => { submit.disabled = form.word.value.trim().toUpperCase() !== word; });
    form.onsubmit = (e) => { e.preventDefault(); if (!submit.disabled) close(true); };
    setTimeout(() => form.word.focus(), 50);
  });
}

/** Celebración de un logro: sello con destellos. Resuelve al cerrarla. */
export function celebrateDialog({ icon: name = 'trophy', title, text }) {
  return openDialog(html`
    <div class="sheet celebrate" role="alertdialog" aria-labelledby="celebrate-title">
      <div class="cel-burst" aria-hidden="true">${[...Array(12)].map((_, i) => raw(`<i style="--i:${i}"></i>`))}</div>
      <div class="cel-art" aria-hidden="true">${raw(icon(name))}</div>
      <h2 class="sheet-title" id="celebrate-title">${title}</h2>
      <p>${text}</p>
      <div class="actions"><button class="btn btn-primary" data-close>¡Genial!</button></div>
    </div>`, (d, close) => { $('[data-close]', d).onclick = () => close(true); });
}

/** Formulario «Enviar comentario». Resuelve con { kind, message } o null. */
export function feedbackDialog() {
  return openDialog(html`
    <form class="sheet form" novalidate>
      <h2 class="sheet-title">Enviar comentario</h2>
      <p class="muted small">¿Algo no funciona, echas algo en falta o tienes una idea? Lo leo todo. Se envía junto con la versión
        de la app y el tipo de dispositivo, para poder reproducir los fallos.</p>
      <div class="seg kind-seg" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="kind" value="fallo"><span>${raw(icon('bug'))} Un fallo</span></label>
        <label><input type="radio" name="kind" value="idea" checked><span>${raw(icon('bulb'))} Una idea</span></label>
        <label><input type="radio" name="kind" value="otro"><span>${raw(icon('chat'))} Otro</span></label>
      </div>
      <label>Cuéntame <textarea name="message" rows="5" maxlength="2000" required
        placeholder="Qué pasó, qué esperabas, en qué pantalla…"></textarea></label>
      <p class="form-error" hidden></p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" class="btn btn-primary">Enviar</button>
      </div>
    </form>`, (d, close) => {
    const form = $('form', d);
    $('[data-cancel]', d).onclick = () => close(null);
    form.onsubmit = (e) => {
      e.preventDefault();
      const message = form.message.value.trim();
      if (message.length < 3) { const err = $('.form-error', d); err.textContent = 'Escribe un poco más, por favor.'; err.hidden = false; return; }
      close({ kind: form.kind.value, message });
    };
    setTimeout(() => form.message.focus(), 50);
  });
}
