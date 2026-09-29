// Pestaña «Aportaciones»: misiones generadas del catálogo (js/quests.js) y lo que ha propuesto el usuario (pendiente,
// aceptado, rechazado), con «Retirar» para lo pendiente. La base de datos ya permite borrar lo propio mientras está
// pendiente (RLS). Los admins la ven desde Perfil y Admin → Ajustes; en su barra está «Admin».
import { html, raw, $, cover, fmtShort, toast } from '../util.js';
import { state, user, bookById, refreshCatalog, refreshLibrary, refreshSuggestions } from '../store.js';
import { viewHeader, confirmDialog, errMsg, FIELD_LABELS } from '../ui.js';
import { suggestionXp, CONTRIB_XP, xpBreakdown } from '../achievements.js';
import { currentQuests } from '../quests.js';
import { formatCode } from '../isbn.js';
import { updateAdminBadge } from '../nav.js';
import { icon } from '../icons.js';
import * as api from '../api.js';

const SEEN_KEY = () => `edm.contribSeen.${user()?.id}`;
const num = (n) => Number(n || 0).toLocaleString('es-ES');

/** Sello de lacre con los PX (misma forma que el sello de la app). */
const WAX = `<svg class="wax" viewBox="0 0 200 200" aria-hidden="true"><defs>
  <radialGradient id="wx-r" cx="74" cy="70" r="129" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e2533a"/><stop offset=".55" stop-color="#b02a1f"/><stop offset="1" stop-color="#7c1811"/></radialGradient>
  <linearGradient id="wx-g" x1="0" y1="40" x2="0" y2="160" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe07a"/><stop offset=".5" stop-color="#f3c02f"/><stop offset="1" stop-color="#c8900f"/></linearGradient></defs>
  <path d="M189.5,108.8 C188.9,111.7 187.5,114.5 186.4,117.2 C185.2,119.9 183.8,122.5 182.6,125.1 C181.4,127.7 180.2,130.2 179.1,132.8 C178.0,135.3 177.6,138.4 175.9,140.6 C174.3,142.8 171.1,144.2 169.1,146.1 C167.0,148.1 165.4,150.2 163.8,152.4 C162.2,154.6 159.9,155.8 159.3,159.3 C158.7,162.8 161.2,169.9 160.4,173.6 C159.6,177.3 157.5,180.6 154.5,181.5 C151.4,182.3 145.7,179.1 142.0,178.7 C138.4,178.3 135.7,178.9 132.8,179.2 C129.9,179.5 127.2,180.2 124.5,180.6 C121.7,181.1 119.0,181.3 116.3,181.9 C113.6,182.6 111.1,184.4 108.3,184.7 C105.6,184.9 102.7,183.8 100.0,183.4 C97.3,183.0 94.7,182.2 91.9,182.2 C89.2,182.1 86.5,182.3 83.5,183.0 C80.5,183.7 76.9,186.1 73.8,186.2 C70.8,186.3 68.0,184.9 65.4,183.4 C62.9,182.0 60.6,179.7 58.6,177.4 C56.6,175.1 55.4,171.9 53.4,169.7 C51.5,167.5 49.2,166.2 47.1,164.4 C45.1,162.6 43.3,160.6 41.1,158.9 C39.0,157.1 36.0,156.1 34.0,154.1 C32.0,152.2 30.8,149.6 29.2,147.3 C27.6,145.0 26.2,142.7 24.4,140.4 C22.7,138.1 20.7,136.0 18.8,133.6 C16.9,131.3 14.1,129.1 12.9,126.4 C11.8,123.7 12.8,120.4 12.0,117.5 C11.3,114.6 8.3,111.9 8.4,109.0 C8.4,106.1 10.8,102.9 12.3,100.0 C13.9,97.1 17.0,94.7 17.6,91.9 C18.3,89.1 16.0,86.1 16.1,83.3 C16.1,80.5 17.0,77.8 17.8,75.1 C18.6,72.4 19.7,69.8 20.8,67.2 C21.9,64.6 23.4,62.2 24.4,59.6 C25.5,57.0 26.2,54.2 27.3,51.4 C28.3,48.6 28.9,45.4 30.6,43.0 C32.2,40.7 34.6,38.6 37.3,37.3 C40.1,36.1 43.9,36.0 47.0,35.4 C50.0,34.7 53.2,34.8 55.5,33.4 C57.9,32.1 59.3,29.6 61.3,27.5 C63.2,25.4 65.0,22.7 67.2,20.8 C69.4,18.8 71.8,16.8 74.4,15.6 C77.0,14.3 79.9,13.7 82.8,13.3 C85.6,12.9 88.6,13.4 91.4,13.2 C94.3,13.0 97.1,12.3 100.0,12.1 C102.9,11.8 105.7,12.1 108.7,11.5 C111.7,11.0 115.6,7.2 118.1,8.9 C120.6,10.6 121.5,19.4 123.7,22.0 C125.9,24.6 128.6,23.9 131.3,24.5 C134.0,25.1 136.7,25.3 139.8,25.6 C142.8,25.9 146.4,25.4 149.3,26.2 C152.2,27.0 155.0,28.4 157.1,30.4 C159.2,32.4 160.4,35.5 162.0,38.0 C163.6,40.5 165.1,42.9 166.7,45.2 C168.3,47.6 169.9,49.9 171.6,52.1 C173.3,54.4 176.1,56.2 177.1,58.8 C178.0,61.4 177.5,64.9 177.5,67.9 C177.6,70.8 177.0,73.8 177.4,76.5 C177.8,79.2 178.5,81.6 179.7,84.1 C180.9,86.7 183.0,89.0 184.7,91.7 C186.4,94.3 189.1,97.1 189.9,100.0 C190.7,102.9 190.1,106.0 189.5,108.8Z" fill="url(#wx-r)"/><circle cx="100" cy="100" r="62" fill="none" stroke="#7c1811" stroke-opacity=".55" stroke-width="3"/>
  <text x="100" y="98" font-size="44" text-anchor="middle">+{px}</text><text x="100" y="138" font-size="30" text-anchor="middle">PX</text></svg>`;

/** Sello de lacre con «+N PX» (también en la portada pública). */
export const waxSeal = (px) => WAX.replace('{px}', num(px));

/** Lo que ha propuesto el usuario: [{ kind, id, book, date, status, xp, label, detail, note }] */
export function myContributions(uid = user()?.id) {
  const out = [];
  for (const b of state.catalog) {
    if (b.created_by !== uid || b.source !== 'app') continue;
    out.push({ kind: 'book', id: b.id, book: b, status: b.status === 'approved' ? 'approved' : 'pending',
      date: b.approved_at || b.created_at, xp: CONTRIB_XP.book, label: `Libro propuesto · ${b.title}` });
  }
  for (const c of state.barcodes) {
    if (c.created_by !== uid || c.source !== 'usuario') continue;
    const b = bookById(c.catalog_id);
    out.push({ kind: 'code', id: `${c.code}|${c.catalog_id}`, code: c.code, book: b, status: c.status,
      date: c.approved_at || c.created_at, xp: CONTRIB_XP.code, label: `Código ${formatCode(c.code)} → ${b?.code ? `${b.code} · ` : ''}${b?.title ?? '—'}` });
  }
  for (const s of state.suggestions) {
    if (s.created_by !== uid) continue;
    const b = bookById(s.catalog_id);
    out.push({ kind: 'suggestion', id: s.id, book: b, status: s.status, date: s.reviewed_at || s.created_at,
      xp: suggestionXp(s.changes), note: s.review_note,
      label: `Corrección en ${b?.code ? `${b.code} · ` : ''}${b?.title ?? '—'}`,
      detail: Object.keys(s.changes || {}).map((k) => FIELD_LABELS[k] || k).join(', ') });
  }
  return out.sort((a, z) => String(z.date).localeCompare(String(a.date)));
}

/** Propuestas resueltas (aceptadas o rechazadas) desde la última visita a la pestaña: burbuja de la barra. */
export function unseenResolved() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY()); } catch { return 0; }
  if (!seen) return 0;
  return myContributions().filter((c) => c.status !== 'pending' && String(c.date) > seen).length;
}

export function renderContributions(root) {
  try { localStorage.setItem(SEEN_KEY(), new Date().toISOString()); } catch { /* sin storage */ }
  updateAdminBadge();
  const mine = myContributions();
  const pending = mine.filter((c) => c.status === 'pending');
  const approved = mine.filter((c) => c.status === 'approved');
  const rejected = mine.filter((c) => c.status === 'rejected');
  const quests = currentQuests(user().id);
  const xp = xpBreakdown().contributionXp;

  const row = (c) => html`<li data-kind="${c.kind}" data-id="${c.id}">
    ${c.book ? raw(cover(c.book, 'cover-xs')) : raw('<span class="cover cover-ph cover-xs" aria-hidden="true"><span>?</span></span>')}
    <div class="cbody">${c.book ? raw(html`<a href="#/libro/${c.book.id}">${c.label}</a>`) : c.label}
      <small>${c.detail ? `${c.detail} · ` : ''}${c.status === 'pending' ? `enviada el ${fmtShort(c.date)}`
        : c.status === 'approved' ? `aceptada el ${fmtShort(c.date)} · +${num(c.xp)} PX` : `revisada el ${fmtShort(c.date)}`}</small>
      ${c.note ? raw(html`<small class="contrib-note">«${c.note}»</small>`) : ''}
    </div>
    <div class="crow"><span class="state ${c.status}">${c.status === 'pending' ? 'Pendiente' : c.status === 'approved' ? 'Aceptada' : 'Rechazada'}</span>
      ${c.status === 'pending' ? raw('<button type="button" class="withdraw" data-withdraw>Retirar</button>') : ''}</div>
  </li>`;

  root.innerHTML = html`
    ${raw(viewHeader('Aportaciones', 'Ayuda a completar el catálogo de la Marca y sube de nivel', '', { hero: true }))}
    <div class="contrib-summary">
      <span class="pend"><b>${pending.length}</b> ${pending.length === 1 ? 'pendiente' : 'pendientes'}</span>
      <span class="ok"><b>${approved.length}</b> ${approved.length === 1 ? 'aceptada' : 'aceptadas'}</span>
      <span class="px"><b>${num(xp)} PX</b> por aportaciones</span>
    </div>

    <div class="sec-h"><h2>Misiones</h2><small>Se actualizan solas con el catálogo</small></div>
    ${quests.length ? raw(html`<div class="quests">${quests.map((q) => raw(html`<article class="quest ${q.personal ? 'personal' : ''}">
      ${raw(waxSeal(q.px))}
      <span class="quest-kind">${q.kind}</span>
      <h3>${q.title}</h3>
      <p>${q.text}</p>
      ${q.total ? raw(html`<div class="progress"><i><b style="width:${Math.round((q.done / q.total) * 100)}%"></b></i>
        <span>${q.done} de ${q.total} ${q.progressLabel}</span></div>`) : ''}
      ${q.books ? raw(html`<details class="quest-books"><summary>Ver ${q.books.length === 1 ? 'el libro' : `los ${q.books.length} libros`}</summary>
        <ul>${q.books.map((b) => raw(html`<li data-book="${b.id}">${raw(cover(b, 'cover-xs'))}
          <a href="#/libro/${b.id}">${b.code ? `${b.code} · ` : ''}${b.title}</a>
          <button type="button" class="link-btn" data-no-barcode>No tiene código</button></li>`))}</ul>
        <p class="small">Si el libro no lleva código de barras impreso (los módulos antiguos), pulsa «No tiene código»: tras
          revisarlo, deja de salir en esta misión para todos.</p></details>`) : ''}
      ${q.href ? raw(html`<a class="quest-cta" href="${q.href}">${q.cta} →</a>`)
        : raw(html`<button type="button" class="quest-cta" data-quest-book="${q.book}">${q.cta} →</button>`)}
      <span class="sr-only">Recompensa: ${q.px} PX por cada aportación aceptada</span>
    </article>`))}</div>`)
      : raw(html`<p class="panel muted">No hay misiones abiertas: el catálogo está al día. ¡Gracias, escriba!</p>`)}

    <div class="sec-h"><h2>Tus aportaciones</h2>${pending.length ? raw('<small>Las pendientes puedes retirarlas</small>') : ''}</div>
    <section class="panel">
      ${mine.length ? '' : raw(html`<p class="muted small">Aún no has propuesto nada. Empieza por una misión, escanea un libro
        que no esté en el catálogo o usa «Sugerir cambios» en cualquier ficha.</p>`)}
      ${pending.length ? raw(html`<ul class="contribs">${pending.map((c) => raw(row(c)))}</ul>`) : ''}
      ${approved.length + rejected.length ? raw(html`<details class="history" ${pending.length ? '' : 'open'}>
        <summary>Historial: ${approved.length} ${approved.length === 1 ? 'aceptada' : 'aceptadas'}${rejected.length ? ` · ${rejected.length} ${rejected.length === 1 ? 'rechazada' : 'rechazadas'}` : ''}</summary>
        <ul class="contribs">${[...approved, ...rejected].sort((a, z) => String(z.date).localeCompare(String(a.date))).map((c) => raw(row(c)))}</ul>
      </details>`) : ''}
    </section>
    <p class="center pad"><a class="btn btn-ghost btn-sm" href="#/comunidad">${raw(icon('quill'))} Ver los Escribas</a></p>`;

  root.addEventListener('click', onClick);
  async function onClick(e) {
    const quest = e.target.closest('[data-quest-book]');
    if (quest) {
      // Abre la ficha con «Sugerir cambios» ya desplegado
      try { sessionStorage.setItem('edm.openSuggest', quest.dataset.questBook); } catch { /* sin storage */ }
      location.hash = `#/libro/${quest.dataset.questBook}`;
      return;
    }
    const noCode = e.target.closest('[data-no-barcode]');
    if (noCode) {
      const b = bookById(noCode.closest('[data-book]').dataset.book);
      if (!(await confirmDialog(`¿«${b.title}» no lleva código de barras impreso? Se enviará para revisar.`, { ok: 'Enviar' }))) return;
      noCode.disabled = true;
      try {
        await api.createSuggestion(b.id, { no_barcode: true }, 'Desde la misión de códigos de barras');
        await refreshSuggestions();
        toast('Gracias: se revisará pronto', 'ok');
        root.removeEventListener('click', onClick);
        renderContributions(root);
      } catch (err) { toast(errMsg(err), 'error'); noCode.disabled = false; }
      return;
    }
    const btn = e.target.closest('[data-withdraw]');
    if (!btn) return;
    const li = btn.closest('li');
    const c = mine.find((x) => x.kind === li.dataset.kind && String(x.id) === li.dataset.id);
    const msg = c.kind === 'book'
      ? `¿Retirar tu propuesta de «${c.book.title}»? Se borran también los códigos de barras que propusiste para él y sale de tu biblioteca.`
      : `¿Retirar esta ${c.kind === 'code' ? 'propuesta de código' : 'corrección'}?`;
    if (!(await confirmDialog(msg, { ok: 'Retirar', danger: true }))) return;
    btn.disabled = true;
    try {
      if (c.kind === 'book') { await api.deleteBook(c.id); await Promise.all([refreshCatalog(), refreshLibrary()]); }
      else if (c.kind === 'code') { await api.deleteBarcode(c.code, c.book.id); await refreshCatalog(); }
      else { await api.deleteSuggestion(c.id); await refreshSuggestions(); }
      toast('Propuesta retirada', 'ok');
      root.removeEventListener('click', onClick);
      renderContributions(root);
    } catch (err) { toast(errMsg(err), 'error'); btn.disabled = false; }
  }
  return { cleanup: () => root.removeEventListener('click', onClick) };
}
