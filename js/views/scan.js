import { html, raw, $, cover, fmtDate, toast } from '../util.js';
import {
  state, user, isAdmin, refreshCatalog, refreshLibrary,
  booksForBarcode, booksForPubCode, barcodesOf, matches, compareBooks,
} from '../store.js';
import { startScanner, cameraAvailable } from '../scanner.js';
import { normalizeCode, formatCode, isPubCode } from '../isbn.js';
import { bookFormDialog, errMsg } from '../ui.js';
import * as api from '../api.js';
import { track } from '../track.js';

export function renderScan(root) {
  let scanner = null;
  let busy = false;
  let torchOn = false;
  let shownCode = null;   // código cuyo resultado se está mostrando (no se vuelve a procesar)
  let resumeTimer = null; // reactiva el escáner unos segundos después de un resultado
  let idleTimer = null;   // pista si pasa un rato sin detectar nada

  const RESUME_MS = 2500;
  const IDLE_HINT_MS = 8000;
  const dialogOpen = () => document.getElementById('dialog')?.open;

  function armIdleHint() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!busy && scanner) status.textContent = '¿No lo detecta? Acerca el libro, busca buena luz o escribe el código abajo.';
    }, IDLE_HINT_MS);
  }

  /** Tras mostrar un resultado, vuelve a escanear sola: un código distinto sustituye al resultado. */
  function scheduleResume() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      busy = false;
      if (scanner) { status.textContent = 'Listo para el siguiente libro'; armIdleHint(); }
    }, RESUME_MS);
  }

  function onDetected(code) {
    if (busy || code === shownCode || dialogOpen()) return;
    // No pisar el resultado si el usuario está escribiendo en él (buscador de "¿qué libro es?")
    if (document.activeElement?.matches('input, textarea') && result.contains(document.activeElement)) return;
    handleBarcode(code);
  }

  root.innerHTML = html`
    <header class="view-head"><div><h1>Escanear</h1><p class="muted">Apunta al código de barras de la contraportada.</p></div></header>
    <div class="scanner">
      <video playsinline muted></video>
      <div class="scan-frame" aria-hidden="true"><span></span></div>
      <div class="scan-status" role="status">Iniciando cámara…</div>
      <button class="btn-icon torch" hidden aria-label="Linterna" title="Linterna">🔦</button>
      <button class="btn btn-primary cam-retry" hidden>Activar cámara</button>
    </div>
    <form class="manual" autocomplete="off">
      <input name="code" placeholder="Código de barras o de publicación (B19)" aria-label="Código de barras o de publicación">
      <button class="btn btn-ghost">Buscar</button>
    </form>
    <p class="muted small hint">¿Tu libro no tiene código de barras? Escribe el código de la portada (B1, X2, G0…).</p>
    <section class="scan-result" aria-live="polite"></section>`;

  const video = $('video', root);
  const status = $('.scan-status', root);
  const result = $('.scan-result', root);
  const torchBtn = $('.torch', root);
  const retry = $('.cam-retry', root);

  async function start() {
    retry.hidden = true;
    if (!cameraAvailable()) {
      status.textContent = 'La cámara necesita HTTPS. Usa la entrada manual.';
      return;
    }
    try {
      status.textContent = 'Iniciando cámara…';
      scanner = await startScanner(video, onDetected);
      status.textContent = 'Buscando código…';
      armIdleHint();
      torchBtn.hidden = !scanner.hasTorch;
    } catch (e) {
      console.error(e);
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
        : 'No se pudo abrir la cámara.';
      retry.hidden = false;
    }
  }

  torchBtn.onclick = () => { torchOn = !torchOn; scanner?.torch(torchOn); torchBtn.classList.toggle('on', torchOn); };
  retry.onclick = start;

  $('.manual', root).onsubmit = (e) => {
    e.preventDefault();
    const input = e.target.code;
    const value = input.value.trim();
    if (!value) return;
    const barcode = normalizeCode(value);
    if (barcode) {
      input.value = ''; input.blur();
      handleBarcode(barcode);
    } else if (isPubCode(value)) {
      const books = booksForPubCode(value);
      if (!books.length) { toast(`No hay ningún libro con el código ${value.toUpperCase()}.`, 'error'); return; }
      input.value = ''; input.blur();
      busy = true;
      shownCode = null;
      clearTimeout(idleTimer);
      books.length === 1 ? showBook(books[0]) : showChoice(books, null);
      scheduleResume();
    } else {
      toast('Código no válido. Revisa los dígitos.', 'error');
    }
  };

  async function handleBarcode(code) {
    busy = true;
    shownCode = code;
    clearTimeout(idleTimer);
    clearTimeout(resumeTimer);
    status.textContent = `Leído ${formatCode(code)}`;
    result.innerHTML = html`<div class="result-card"><p class="muted">Buscando ${formatCode(code)}…</p></div>`;
    let books = booksForBarcode(code);
    if (!books.length) {
      // Puede haberse añadido desde otro dispositivo: refrescar y reintentar
      try { await refreshCatalog(); books = booksForBarcode(code); } catch (e) { toast(errMsg(e), 'error'); }
    }
    track('scan', books.length === 1 ? 'hit' : books.length > 1 ? 'multi' : 'unknown');
    if (books.length === 1) showBook(books[0], code);
    else if (books.length > 1) showChoice(books, code);
    else showUnknown(code);
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    scheduleResume();
  }

  function again() {
    result.innerHTML = '';
    busy = false;
    shownCode = null;
    clearTimeout(resumeTimer);
    status.textContent = 'Buscando código…';
    armIdleHint();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const codeLabel = (b) => (b.code ? raw(html`<span class="code">${b.code}</span> `) : '');

  /** Ficha de resultado. `code`: código de barras leído (para verificarlo como admin). */
  function showBook(book, code = null) {
    const entry = state.library.get(book.id);
    const bc = code ? barcodesOf(book.id).find((b) => b.code === code) : null;
    const adminVerify = isAdmin() && bc && !bc.verified;
    result.innerHTML = html`<div class="result-card ${entry ? 'is-owned' : ''}">
      ${raw(cover(book, 'cover-sm'))}
      <div class="result-body">
        ${entry ? raw('<p class="badge badge-ok">Ya registrado</p>')
          : raw(html`<p class="badge">${book.status === 'pending' ? 'Pendiente de revisión' : 'No lo tienes'}</p>`)}
        ${bc?.status === 'pending' ? raw('<p class="badge badge-warn">Código propuesto por ti</p>') : ''}
        <h2>${codeLabel(book)}${book.title}</h2>
        ${entry
          ? raw(html`<p>Lo añadiste a tu biblioteca el <strong>${fmtDate(entry.added_at)}</strong>.</p>`)
          : raw('<p>¿Quieres añadirlo a tu biblioteca?</p>')}
        ${adminVerify ? raw(html`<p class="small muted">Código ${formatCode(code)} sin verificar.
          <button class="link" data-verify>Marcar como verificado</button></p>`) : ''}
        <div class="actions">
          ${entry
            ? raw(html`<a class="btn btn-ghost" href="#/libro/${book.id}">Ver ficha</a>
                <button class="btn btn-primary" data-again>Cerrar</button>`)
            : raw(html`<button class="btn btn-ghost" data-again>Ahora no</button>
                <button class="btn btn-primary" data-add>Añadir</button>`)}
        </div>
      </div>
    </div>`;
    $('[data-again]', result).onclick = again;
    $('[data-verify]', result)?.addEventListener('click', async () => {
      try {
        await api.updateBarcode(code, book.id, { verified: true });
        await refreshCatalog();
        toast('Código verificado', 'ok');
        showBook(book, code);
      } catch (e) { toast(errMsg(e), 'error'); }
    });
    $('[data-add]', result)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api.addToLibrary(user().id, book.id);
        await refreshLibrary();
        toast(`«${book.title}» añadido`, 'ok');
      } catch (err) {
        if (err?.code !== '23505') { toast(errMsg(err), 'error'); e.target.disabled = false; return; }
        await refreshLibrary();
      }
      showBook(book, code);
    });
  }

  /** Un mismo código en varios libros (error en las fuentes): el usuario elige. */
  function showChoice(books, code) {
    result.innerHTML = html`<div class="result-card is-unknown">
      <div class="result-body">
        <p class="badge badge-warn">Varios libros</p>
        <h2>${code ? `El código ${formatCode(code)} aparece en ${books.length} libros` : `${books.length} libros con ese código`}</h2>
        <p class="muted small">Elige el que tienes en la mano.</p>
        <div class="actions"><button class="btn btn-ghost" data-again>Cancelar</button></div>
        <ul class="pick-list">
          ${books.sort(compareBooks).map((b) => raw(html`<li><button class="pick" data-id="${b.id}">
            ${raw(cover(b, 'cover-xs'))}<span>${codeLabel(b)}${b.title}
            ${state.library.has(b.id) ? raw('<small>✓ En tu biblioteca</small>') : ''}</span></button></li>`))}
        </ul>
      </div>
    </div>`;
    $('[data-again]', result).onclick = again;
    result.querySelectorAll('.pick').forEach((btn) => (btn.onclick = () => showBook(state.catalog.find((b) => b.id === btn.dataset.id), code)));
  }

  /** Código desconocido: elegir a qué libro pertenece o proponer uno nuevo. */
  function showUnknown(code) {
    const admin = isAdmin();
    result.innerHTML = html`<div class="result-card is-unknown">
      <div class="result-body">
        <p class="badge badge-warn">Código desconocido</p>
        <h2>${formatCode(code)} no está en el catálogo</h2>
        <p class="muted small">${admin
          ? 'Elige a qué libro pertenece: el código quedará asignado y verificado.'
          : 'Si sabes qué libro es, elígelo: se añadirá a tu biblioteca y el código quedará propuesto para revisión.'}</p>
        <div class="actions">
          <button class="btn btn-ghost" data-again>Cancelar</button>
          <button class="btn btn-ghost" data-new>No está: ${admin ? 'crear libro' : 'proponer libro'}</button>
        </div>
        <input type="search" class="search pick-search" placeholder="¿Qué libro es? Busca por título o código (B19)…" aria-label="Buscar libro">
        <ul class="pick-list"></ul>
      </div>
    </div>`;
    const list = $('.pick-list', result);
    const drawPicks = (q) => {
      // Sin búsqueda: primero los libros que aún no tienen código de barras
      const withCode = new Set(state.barcodes.map((b) => b.catalog_id));
      const pool = state.catalog.filter((b) => matches(b, q))
        .sort((a, b) => (q ? 0 : withCode.has(a.id) - withCode.has(b.id)) || compareBooks(a, b))
        .slice(0, 30);
      list.innerHTML = pool.map((b) => html`<li><button class="pick" data-id="${b.id}">
        ${raw(cover(b, 'cover-xs'))}<span>${codeLabel(b)}${b.title}
        ${withCode.has(b.id) ? '' : raw('<small>sin código de barras</small>')}</span></button></li>`).join('')
        || html`<li class="muted small">Sin resultados.</li>`;
    };
    drawPicks('');
    $('.pick-search', result).addEventListener('input', (e) => drawPicks(e.target.value.trim()));
    $('[data-again]', result).onclick = again;

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.pick');
      if (!btn) return;
      const book = state.catalog.find((b) => b.id === btn.dataset.id);
      btn.disabled = true;
      try {
        await api.addBarcode(user().id, code, book.id, { admin });
        if (!admin && !state.library.has(book.id)) await api.addToLibrary(user().id, book.id);
        await Promise.all([refreshCatalog(), refreshLibrary()]);
        toast(admin ? 'Código asignado' : 'Gracias: código propuesto y libro añadido', 'ok');
        showBook(book, code);
      } catch (err) { toast(errMsg(err), 'error'); btn.disabled = false; }
    });

    $('[data-new]', result).onclick = async () => {
      const res = await bookFormDialog({
        heading: admin ? 'Nuevo libro' : 'Proponer libro',
        submit: admin ? 'Crear' : 'Proponer y añadir',
        withBarcode: true, barcode: code,
      });
      if (!res) return;
      try {
        const book = await api.createBook(user().id, res.fields, { admin });
        if (res.barcode) await api.addBarcode(user().id, res.barcode, book.id, { admin });
        await api.addToLibrary(user().id, book.id);
        await Promise.all([refreshCatalog(), refreshLibrary()]);
        toast(admin ? 'Libro creado y añadido' : 'Propuesta enviada y libro añadido', 'ok');
        showBook(book, res.barcode);
      } catch (e) { toast(errMsg(e), 'error'); }
    };
  }

  start();
  return { cleanup: () => { clearTimeout(resumeTimer); clearTimeout(idleTimer); scanner?.stop(); } };
}
