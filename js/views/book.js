import { html, raw, $, cover, fmtDate, fmtShort, toast } from '../util.js';
import { state, user, isAdmin, isSupporter, bookById, categoryName, barcodesOf, personName, refreshCatalog, refreshLibrary, refreshSuggestions } from '../store.js';
import { bookFormDialog, confirmDialog, errMsg, CONDITIONS, PERK_TAG, suggestDialog, diffFields, FIELD_LABELS } from '../ui.js';
import { formatCode, normalizeCode } from '../isbn.js';
import { navigate } from '../router.js';
import { icon, ribbon } from '../icons.js';
import { settings } from '../settings.js';
import { removeWithUndo } from '../library-actions.js';
import { gameInfo } from './finder.js';
import { neighbors, onSwipe } from '../navlist.js';
import * as api from '../api.js';

export async function renderBook(root, { id }) {
  const book = bookById(id);
  if (!book) {
    root.innerHTML = html`<div class="empty"><h2>Libro no encontrado</h2><a class="btn btn-ghost" href="#/catalogo">Ir al catálogo</a></div>`;
    return;
  }
  const uid = user().id;
  const entry = state.library.get(book.id);
  const supporter = isSupporter();
  const admin = isAdmin();
  let loans = [];
  let plays = [];
  if (supporter) {
    try {
      const [l, p] = await Promise.all([api.getLoans(uid), api.getPlays(uid)]);
      loans = l.filter((x) => x.catalog_id === book.id);
      plays = p.filter((x) => x.catalog_id === book.id);
    } catch { /* RLS */ }
  }
  const activeLoan = loans.find((l) => !l.returned_at);
  const wished = state.wishlist.has(book.id);
  const codes = barcodesOf(book.id);

  const nav = neighbors(book.id);
  const navBtn = (id, dir) => {
    const b = id && bookById(id);
    if (!b) return html`<span class="book-nav-btn" aria-hidden="true"></span>`;
    const label = b.code || b.title;
    return html`<a class="book-nav-btn ${dir}" href="#/libro/${b.id}" data-nav="${b.id}" aria-label="${dir === 'prev' ? 'Anterior' : 'Siguiente'}: ${b.title}">
      ${dir === 'prev' ? '‹ ' : ''}<span>${label}</span>${dir === 'next' ? ' ›' : ''}</a>`;
  };

  root.innerHTML = html`<div class="book-page">
    <div class="book-top">
      <button class="back" onclick="history.length > 1 ? history.back() : (location.hash = '#/biblioteca')">← Volver</button>
      ${nav ? raw(html`<nav class="book-nav" aria-label="Navegar por ${nav.label}">
        ${raw(navBtn(nav.prev, 'prev'))}
        <span class="book-nav-pos">${nav.index + 1} / ${nav.total}</span>
        ${raw(navBtn(nav.next, 'next'))}
      </nav>`) : ''}
    </div>
    <article class="book">
      ${raw(cover(book, 'cover-lg'))}
      <div class="book-info">
        <p class="eyebrow">${book.code ? `${book.code} · ` : ''}${categoryName(book.category_id)}</p>
        <h1>${book.title}</h1>
        ${book.author ? raw(html`<p class="author">${book.author}</p>`) : ''}
        ${book.status === 'pending' ? raw('<p class="badge badge-warn">Pendiente de revisión</p>') : ''}
        <dl class="meta">
          ${book.kind ? raw(html`<dt>Tipo</dt><dd>${book.kind}</dd>`) : ''}
          ${book.pages ? raw(html`<dt>Páginas</dt><dd>${book.pages}</dd>`) : ''}
          ${book.binding ? raw(html`<dt>Formato</dt><dd>${book.binding}${book.interior ? `, ${book.interior}` : ''}</dd>`) : ''}
          ${book.price_eur ? raw(html`<dt>PVP</dt><dd>${Number(book.price_eur).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}${book.catalog_date ? ` (catálogo ${fmtShort(book.catalog_date)})` : ''}</dd>`) : ''}
          ${codes.length ? raw(html`<dt>Código de barras</dt><dd>${codes.map((c) => raw(html`<span class="barcode">${formatCode(c.code)}${c.status === 'pending' ? raw(' <span class="badge badge-warn">propuesto</span>') : ''}${admin && c.status === 'approved' && !c.verified ? raw(' <span class="badge">sin verificar</span>') : ''}</span>`))}</dd>`) : ''}
        </dl>
        ${gameInfo(book) ? raw(html`<p class="game-info">${raw(icon('dice'))} ${gameInfo(book)}</p>`) : ''}
        ${(book.tags || []).length ? raw(html`<p class="tags">${book.tags.map((t) => raw(html`<span class="tag">${t}</span>`))}</p>`) : ''}
        ${book.summary ? raw(html`<p class="desc">${book.summary}</p>`) : ''}
        ${book.description ? raw(html`<p class="desc">${book.description}</p>`) : ''}
        <p class="small links">
          ${book.meta?.fuente_sombra ? raw(html`<a href="${book.meta.fuente_sombra}" target="_blank" rel="noopener">Ficha en Distribuciones Sombra ↗</a>`) : ''}
          ${book.codex_url ? raw(html`<a href="${book.codex_url}" target="_blank" rel="noopener">Ficha en Codex LMDE ↗</a>`) : ''}
        </p>
      </div>
    </article>

    ${!admin ? raw(suggestBlock(book, uid)) : ''}

    ${entry ? raw(html`
      <section class="panel owned">
        <p class="badge badge-ok">En tu biblioteca</p>
        <p>Registrado el <strong>${fmtDate(entry.added_at)}</strong></p>
        <form class="form entry-form">
          <label>Estado
            <select name="condition">
              <option value="">—</option>
              ${CONDITIONS.map((c) => raw(html`<option ${entry.condition === c ? 'selected' : ''}>${c}</option>`))}
            </select>
          </label>
          <label>Notas <textarea name="notes" rows="3" placeholder="Edición, firmas, dónde lo compré…">${entry.notes ?? ''}</textarea></label>
          ${supporter ? raw(html`<label>Ejemplares repetidos (para intercambio) ${raw(PERK_TAG)}
            <input name="spares" type="number" inputmode="numeric" min="0" max="99" value="${entry.spares ?? 0}">
          </label>`) : ''}
          <div class="actions">
            <button type="button" class="btn btn-ghost btn-danger-text" data-remove>Quitar</button>
            <button class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </section>`) : raw(html`
      <section class="panel">
        <p>No tienes este libro.</p>
        <div class="actions">
          <button class="btn btn-ghost" data-wish>${wished ? '★ En tu lista de deseos' : '☆ Lo quiero'}</button>
          <button class="btn btn-primary" data-add>Añadir a mi biblioteca</button>
        </div>
      </section>`)}

    ${supporter ? raw(html`
      <section class="panel perk">${raw(ribbon('perk'))}
        <h2>Diario de partidas</h2>
        ${plays.length ? raw(html`<ul class="plays">${plays.map((p) => raw(html`<li data-play="${p.id}">
          <span><strong>${p.role === 'dirigido' ? 'Dirigido' : 'Jugado'}</strong> el ${fmtShort(p.played_on)}${p.group_name ? ` · ${p.group_name}` : ''}
            ${p.notes ? raw(html`<small>${p.notes}</small>`) : ''}</span>
          <button class="link btn-danger-text" data-play-del aria-label="Borrar entrada">Borrar</button>
        </li>`))}</ul>`) : raw('<p class="muted small">Aún no lo has jugado ni dirigido.</p>')}
        <form class="form play-form">
          <div class="row2">
            <label>Rol <select name="role"><option value="dirigido">Lo dirigí</option><option value="jugado">Lo jugué</option></select></label>
            <label>Fecha <input name="played_on" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
          </div>
          <label>Grupo <input name="group_name" maxlength="80" placeholder="El grupo del jueves…"></label>
          <label>Notas <input name="notes" maxlength="300" placeholder="Qué pasó, qué quedó pendiente…"></label>
          <div class="actions"><button class="btn btn-ghost">Añadir al diario</button></div>
        </form>
      </section>`) : ''}

    ${entry ? raw(supporter ? html`
      <section class="panel perk">${raw(ribbon('perk'))}
        <h2>Préstamos</h2>
        ${activeLoan
          ? raw(html`<p>Prestado a <strong>${activeLoan.lent_to}</strong> desde el ${fmtShort(activeLoan.lent_at)}.</p>
              <button class="btn btn-ghost" data-return="${activeLoan.id}">Marcar devuelto</button>`)
          : raw(html`<form class="inline-form loan-form"><input name="to" required placeholder="¿A quién se lo prestas?" maxlength="80"><button class="btn btn-ghost">Prestar</button></form>`)}
        ${loans.filter((l) => l.returned_at).length ? raw(html`<ul class="history">${loans.filter((l) => l.returned_at).map((l) =>
          raw(html`<li>${l.lent_to}: ${fmtShort(l.lent_at)} → ${fmtShort(l.returned_at)}</li>`))}</ul>`) : ''}
      </section>` : html`
      <a class="panel teaser" href="#/mecenas">${raw(icon('lock'))} Diario de partidas, préstamos y repetidos: <strong>hazte Mecenas</strong></a>`) : ''}

    ${admin ? raw(html`
      <section class="panel admin-zone">${raw(ribbon('admin'))}
        <h2>Administración</h2>
        <dl class="meta audit">${raw(provenance(book))}</dl>
        ${codes.length ? raw(html`<ul class="rows">${codes.map((c) => raw(html`<li class="row" data-code="${c.code}">
          <span class="row-title">${formatCode(c.code)}<small>${barcodeInfo(c)}</small></span>
          ${c.status === 'pending' || !c.verified ? raw('<button class="btn btn-sm btn-ghost" data-code-ok>Verificar</button>') : ''}
          <button class="btn btn-sm btn-ghost btn-danger-text" data-code-del aria-label="Quitar código">Quitar</button>
        </li>`))}</ul>`) : ''}
        <form class="inline-form barcode-form"><input name="barcode" inputmode="numeric" placeholder="Añadir código de barras"><button class="btn btn-ghost">Añadir</button></form>
        <details class="history-box">
          <summary>Historial de cambios</summary>
          <div class="history-list"><p class="muted small">Cargando…</p></div>
        </details>
        <div class="actions">
          <button class="btn btn-ghost btn-danger-text" data-delete>Borrar del catálogo</button>
          ${book.status === 'pending' ? raw('<button class="btn btn-ghost" data-approve>Aprobar</button>') : ''}
          <button class="btn btn-primary" data-edit>Editar</button>
        </div>
      </section>`) : ''}</div>`;

  const rerender = () => renderBook(root, { id });

  // Anterior / siguiente: sustituye la entrada del historial para que «Volver» regrese a la lista
  const go = (target) => { if (target) location.replace(`#/libro/${target}`); };
  root.querySelectorAll('[data-nav]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.nav); }));
  if (nav) {
    onSwipe($('.book-page', root), { left: () => go(nav.next), right: () => go(nav.prev) });
    setKeyNav((e) => {
      if (e.target.closest('input, textarea, select') || document.getElementById('dialog')?.open) return;
      if (e.key === 'ArrowLeft') go(nav.prev);
      if (e.key === 'ArrowRight') go(nav.next);
    });
  } else setKeyNav(null);
  const run = (fn) => async (e) => {
    e?.preventDefault?.();
    try { await fn(e); } catch (err) { toast(errMsg(err), 'error'); }
  };

  $('[data-add]', root)?.addEventListener('click', run(async () => {
    await api.addToLibrary(uid, book.id);
    if (wished) { await api.removeWish(uid, book.id).catch(() => {}); state.wishlist.delete(book.id); }
    await refreshLibrary();
    toast('Añadido a tu biblioteca', 'ok');
    rerender();
  }));

  $('[data-wish]', root)?.addEventListener('click', run(async () => {
    if (wished) { await api.removeWish(uid, book.id); state.wishlist.delete(book.id); }
    else { await api.addWish(uid, book.id); state.wishlist.add(book.id); }
    rerender();
  }));

  $('.entry-form', root)?.addEventListener('submit', run(async (e) => {
    const f = new FormData(e.target);
    const fields = { condition: f.get('condition') || null, notes: f.get('notes').trim() || null };
    if (f.has('spares')) fields.spares = Math.max(0, Math.min(99, Number(f.get('spares')) || 0));
    await api.updateLibraryEntry(uid, book.id, fields);
    await refreshLibrary();
    toast('Guardado', 'ok');
  }));

  $('[data-remove]', root)?.addEventListener('click', run(async () => {
    // Sin confirmación: el aviso ofrece «Deshacer» y recupera fecha de registro, estado y notas
    await removeWithUndo(book.id, () => { if (location.hash === `#/libro/${book.id}`) rerender(); });
  }));

  $('.play-form', root)?.addEventListener('submit', run(async (e) => {
    const f = new FormData(e.target);
    await api.addPlay(uid, book.id, {
      role: f.get('role'), played_on: f.get('played_on'),
      group_name: f.get('group_name').trim() || null, notes: f.get('notes').trim() || null,
    });
    toast('Añadido al diario', 'ok');
    rerender();
  }));

  root.querySelectorAll('[data-play-del]').forEach((btn) => btn.addEventListener('click', run(async () => {
    await api.deletePlay(btn.closest('[data-play]').dataset.play);
    rerender();
  })));

  $('.loan-form', root)?.addEventListener('submit', run(async (e) => {
    await api.addLoan(uid, book.id, e.target.to.value.trim());
    rerender();
  }));

  $('[data-return]', root)?.addEventListener('click', run(async (e) => {
    await api.returnLoan(e.target.dataset.return);
    rerender();
  }));

  $('.barcode-form', root)?.addEventListener('submit', run(async (e) => {
    const code = normalizeCode(e.target.barcode.value);
    if (!code) { toast('Código no válido. Revisa los dígitos.', 'error'); return; }
    await api.addBarcode(uid, code, book.id, { admin: true });
    await refreshCatalog();
    rerender();
  }));

  root.querySelectorAll('[data-code-ok], [data-code-del]').forEach((btn) => btn.addEventListener('click', run(async () => {
    const code = btn.closest('[data-code]').dataset.code;
    if (btn.hasAttribute('data-code-ok')) await api.updateBarcode(code, book.id, { status: 'approved', verified: true });
    else await api.deleteBarcode(code, book.id);
    await refreshCatalog();
    rerender();
  })));

  $('[data-edit]', root)?.addEventListener('click', run(async () => {
    const res = await bookFormDialog({ initial: book, heading: 'Editar libro' });
    if (!res) return;
    await api.updateBook(book.id, res.fields);
    await refreshCatalog();
    toast('Libro actualizado', 'ok');
    rerender();
  }));

  // --- Sugerir cambios (usuarios) ---
  $('[data-suggest]', root)?.addEventListener('click', run(async () => {
    const res = await suggestDialog(book);
    if (!res) return;
    await api.createSuggestion(book.id, res.changes, res.note);
    await refreshSuggestions();
    toast('Gracias: tu sugerencia se revisará pronto', 'ok');
    rerender();
  }));
  $('[data-suggest-del]', root)?.addEventListener('click', run(async (e) => {
    await api.deleteSuggestion(Number(e.target.dataset.suggestDel));
    await refreshSuggestions();
    toast('Sugerencia retirada');
    rerender();
  }));

  // --- Historial (admin): se carga al abrirlo ---
  const hbox = $('.history-box', root);
  hbox?.addEventListener('toggle', async () => {
    if (!hbox.open || hbox.dataset.loaded) return;
    hbox.dataset.loaded = '1';
    const list = $('.history-list', hbox);
    try {
      const rows = await api.getHistory(book.id);
      list.innerHTML = rows.length ? rows.map(historyItem).join('') : html`<p class="muted small">Sin cambios registrados desde que existe el historial.</p>`;
    } catch (err) { list.innerHTML = html`<p class="muted small">${errMsg(err)}</p>`; }
  });
  // Sin run(): su preventDefault impediría abrir/cerrar el <details> al pulsar el resumen
  hbox?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-restore]');
    if (!btn) return;
    try {
    if (!(await confirmDialog('¿Restaurar esta versión? Los datos volverán a como estaban antes de ese cambio (el cambio actual quedará también en el historial).', { ok: 'Restaurar' }))) return;
    await api.adminRestoreVersion(Number(btn.dataset.restore));
    await refreshCatalog();
    toast('Versión restaurada', 'ok');
    if (bookById(book.id)) rerender(); else navigate('/catalogo');
    } catch (err) { toast(errMsg(err), 'error'); }
  });

  $('[data-approve]', root)?.addEventListener('click', run(async () => {
    await api.updateBook(book.id, { status: 'approved' });
    await refreshCatalog();
    rerender();
  }));

  $('[data-delete]', root)?.addEventListener('click', run(async () => {
    if (!(await confirmDialog(`¿Borrar «${book.title}» del catálogo? Desaparecerá de todas las bibliotecas.`, { ok: 'Borrar', danger: true }))) return;
    await api.deleteBook(book.id);
    await Promise.all([refreshCatalog(), refreshLibrary()]);
    toast('Libro borrado');
    navigate('/catalogo');
  }));
}

const SOURCE_LABEL = { sombra: 'Distribuciones Sombra', admin: 'admin', usuario: 'usuario' };

/** Quién y cuándo añadió el libro al catálogo general (solo admin). */
function provenance(book) {
  const rows = [];
  if (book.source === 'csv') {
    rows.push(['Origen', 'Importado del CSV del catálogo (Sombra / Tesoros / Codex)']);
  } else {
    rows.push(['Propuesto por', `${personName(book.created_by) ?? 'desconocido'} · ${fmtDate(book.created_at)}`]);
  }
  if (book.status === 'pending') rows.push(['Estado', 'Pendiente de validar']);
  else if (book.approved_at) rows.push(['Validado por', `${personName(book.approved_by) ?? 'desconocido'} · ${fmtDate(book.approved_at)}`]);
  return rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** Estado y procedencia de un código de barras (solo admin). */
function barcodeInfo(c) {
  const status = c.status === 'pending' ? 'pendiente' : c.verified ? 'verificado' : 'sin verificar';
  const who = c.source === 'sombra' ? 'Distribuciones Sombra'
    : `${personName(c.created_by) ?? SOURCE_LABEL[c.source]} · ${fmtShort(c.created_at)}`;
  const approved = c.approved_at ? ` · validado por ${personName(c.approved_by) ?? 'desconocido'} ${fmtShort(c.approved_at)}` : '';
  return `${status} · ${who}${approved}`;
}

// Un único listener de teclado global para las flechas; la ficha activa decide qué hacen
let keyHandler = null;
let keyBound = false;
function setKeyNav(fn) {
  keyHandler = fn;
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', (e) => {
      if (!location.hash.startsWith('#/libro/')) return;
      keyHandler?.(e);
    });
  }
}

/** Bloque «Sugerir cambios» para usuarios, con el estado de sus sugerencias sobre este libro. */
function suggestBlock(book, uid) {
  const mine = state.suggestions.filter((sg) => sg.catalog_id === book.id && sg.created_by === uid);
  const pending = mine.find((sg) => sg.status === 'pending');
  const last = mine.find((sg) => sg.status !== 'pending');
  return html`<section class="suggest-box">
    ${pending ? raw(html`<p class="small"><span class="badge badge-warn">Pendiente</span> Enviaste una sugerencia el ${fmtShort(pending.created_at)}
      (${Object.keys(pending.changes).map((k) => FIELD_LABELS[k] || k).join(', ')}).
      <button class="link" data-suggest-del="${pending.id}">Retirar</button></p>`)
    : settings.suggestions_enabled ? raw(html`<p class="small muted">¿Falta algún dato o hay algo mal?
      <button class="btn btn-sm btn-ghost" data-suggest>✎ Sugerir cambios</button></p>`)
    : raw('<p class="small muted">Las sugerencias de cambios están pausadas temporalmente.</p>')}
    ${last ? raw(html`<p class="small muted">Tu última sugerencia fue ${last.status === 'approved' ? 'aceptada ✓' : 'rechazada'}${last.review_note ? `: «${last.review_note}»` : ''}.</p>`) : ''}
  </section>`;
}

const OP_LABEL = { insert: 'Alta', update: 'Cambio', delete: 'Borrado', restore: 'Restauración' };

/** Una entrada del historial con sus diferencias y el botón para volver a la versión anterior. */
function historyItem(h) {
  const who = h.changed_by ? personName(h.changed_by) : 'sincronización del CSV';
  const isCode = h.table_name === 'catalog_barcodes';
  const code = (h.new_data || h.old_data || {}).code;
  const diffs = h.op === 'update' || h.op === 'restore' ? diffFields(h.old_data, h.new_data) : [];
  return html`<div class="history-item">
    <p class="history-head"><strong>${OP_LABEL[h.op] || h.op}${isCode ? ` de código ${code}` : ''}</strong>
      <small>${fmtDate(h.created_at)} · ${who}</small></p>
    ${diffs.length ? raw(html`<ul class="diff">${diffs.map((d) => raw(html`<li><span>${d.label}</span> <del>${d.from}</del> → <ins>${d.to}</ins></li>`))}</ul>`) : ''}
    ${h.old_data ? raw(html`<button class="btn btn-sm btn-ghost" data-restore="${h.id}">↶ Restaurar la versión anterior</button>`)
      : raw(html`<button class="btn btn-sm btn-ghost btn-danger-text" data-restore="${h.id}">↶ Deshacer el alta</button>`)}
  </div>`;
}
