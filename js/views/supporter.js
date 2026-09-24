import { html, raw, $, cover, fmtDate, fmtShort, toast, download } from '../util.js';
import { icon } from '../icons.js';
import { state, user, isSupporter, groupByCategory, bookById, categoryName, barcodesOf, compareBooks, loadAll } from '../store.js';
import { viewHeader } from '../ui.js';
import { DONATION_URL, SUPPORTER_MIN_AMOUNT } from '../config.js';
import { settings } from '../settings.js';
import * as api from '../api.js';
import { downloadAllJson, downloadLibraryCsv } from '../export.js';
import { track } from '../track.js';

const PERKS = [
  ['★', 'Insignia de Mecenas', 'En tu perfil, para que se vea que apoyas el proyecto.'],
  ['☆', 'Lista de deseos', 'Marca los libros que te faltan y quieres conseguir.'],
  ['✎', 'Diario de partidas', 'Apunta qué módulos has dirigido o jugado, cuándo y con qué grupo.'],
  ['⚑', 'Lista de deseos compartible', 'Un enlace para que tus amigos sepan qué regalarte.'],
  ['⇄', 'Repetidos e intercambio', 'Marca tus repetidos y descubre qué Mecenas tienen los que te faltan.'],
  ['↔', 'Registro de préstamos', 'Apunta a quién prestas cada libro y cuándo vuelve.'],
  ['▤', 'Estadísticas y valor', 'Porcentaje de colección completa y valor según el precio de catálogo.'],
  ['⤓', 'Exportar biblioteca', 'Descarga tu colección en CSV o JSON cuando quieras.'],
  ['❦', 'Temas Pergamino y Retro EGA', 'Papel envejecido y tinta sepia, o una terminal de los 80 como OSR Manager.'],
];

export async function renderSupporter(root, params = {}) {
  if (!isSupporter()) return renderPitch(root);

  const uid = user().id;
  let loans = [];
  let plays = [];
  let trades = [];
  const profile = state.profile;
  try {
    [loans, plays] = await Promise.all([api.getLoans(uid), api.getPlays(uid)]);
    if (profile.trade_opt_in) trades = await api.tradeMatches();
  } catch { /* RLS */ }
  const active = loans.filter((l) => !l.returned_at);
  const approved = state.catalog.filter((b) => b.status === 'approved');
  const ownedApproved = approved.filter((b) => state.library.has(b.id));
  const pct = approved.length ? Math.round((ownedApproved.length / approved.length) * 100) : 0;
  const wishes = [...state.wishlist].map(bookById).filter(Boolean);
  const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const ownedValue = ownedApproved.reduce((t, b) => t + Number(b.price_eur || 0), 0);
  const missingValue = approved.filter((b) => !state.library.has(b.id)).reduce((t, b) => t + Number(b.price_eur || 0), 0);
  const shareUrl = profile.share_token ? `${location.origin}${location.pathname}#/deseos/${profile.share_token}` : '';

  root.innerHTML = html`
    ${raw(viewHeader('Mecenas', `Gracias por apoyar el proyecto desde el ${fmtDate(state.profile.supporter_since) || 'principio'} ✦`))}
    <nav class="perk-index" aria-label="Extras de Mecenas">
      ${[['coleccion', 'Estadísticas'], ['diario', 'Diario'], ['deseos', 'Deseos'], ['intercambio', 'Intercambio'], ['prestamos', 'Préstamos'], ['exportar', 'Exportar']]
        .map(([id, label]) => raw(html`<a href="#/mecenas/${id}" class="${params.section === id ? 'active' : ''}">${label}</a>`))}
    </nav>

    <section class="panel" id="sec-coleccion">
      <h2>Tu colección</h2>
      <div class="big-stat"><span>${pct}%</span><small>${ownedApproved.length} de ${approved.length} libros del catálogo</small></div>
      <ul class="bars">
        ${groupByCategory(approved).filter((g) => g.books.length).map((g) => {
          const have = g.books.filter((b) => state.library.has(b.id)).length;
          const p = Math.round((have / g.books.length) * 100);
          return raw(html`<li><span class="bar-label">${g.category.name}</span>
            <span class="bar" role="img" aria-label="${have} de ${g.books.length}"><span style="width:${p}%"></span></span>
            <span class="bar-val">${have}/${g.books.length}</span></li>`);
        })}
      </ul>
    </section>

    <section class="panel" id="sec-valor">
      <h2>Valor de la colección</h2>
      <div class="value-stats">
        <div><span>${eur(ownedValue)}</span><small>lo que tienes, a precio de catálogo</small></div>
        <div><span>${eur(missingValue)}</span><small>lo que costaría completarla</small></div>
      </div>
      <p class="muted small">Según el PVP del catálogo de Distribuciones Sombra; los libros sin precio no cuentan.</p>
    </section>

    <section class="panel" id="sec-diario">
      <h2>Diario de partidas</h2>
      <p class="muted small how">Se apunta desde la ficha de cada libro: «Diario de partidas» → «Añadir al diario».</p>
      ${plays.length ? raw(html`<ul class="rows">${plays.slice(0, 8).map((p) => {
        const b = bookById(p.catalog_id);
        return raw(html`<li class="row"><a class="row-title" href="#/libro/${p.catalog_id}">${b?.code ? `${b.code} · ` : ''}${b?.title ?? '—'}
          <small>${p.role === 'dirigido' ? 'Dirigido' : 'Jugado'} el ${fmtShort(p.played_on)}${p.group_name ? ` · ${p.group_name}` : ''}</small></a></li>`);
      })}</ul>`) : raw('<p class="muted">Aún vacío. Desde la ficha de un libro puedes apuntar cuándo lo dirigiste o jugaste.</p>')}
    </section>

    <section class="panel" id="sec-deseos">
      <h2>Lista de deseos</h2>
      <p class="muted small how">Añade libros desde su ficha con «☆ Lo quiero». Puedes compartir la lista con un enlace.</p>
      ${wishes.length ? raw(html`<ul class="rows">${wishes.map((b) => raw(html`<li class="row">${raw(cover(b, 'cover-xs'))}<a class="row-title" href="#/libro/${b.id}">${b.title}<small>${categoryName(b.category_id)}</small></a></li>`))}</ul>`)
        : raw('<p class="muted">Vacía. Abre un libro que te falte y pulsa «☆ Lo quiero».</p>')}
      <div class="share-box">
        ${shareUrl ? raw(html`<p class="small">Cualquiera con este enlace puede ver tu lista de deseos (solo tu nombre y los títulos):</p>
          <div class="inline-form"><input readonly value="${shareUrl}" aria-label="Enlace de tu lista de deseos"><button class="btn btn-ghost" data-share-copy>Copiar</button></div>
          <button class="link btn-danger-text" data-share-off>Dejar de compartir</button>`)
        : raw('<button class="btn btn-ghost" data-share-on>Crear enlace para compartir</button>')}
      </div>
    </section>

    <section class="panel" id="sec-intercambio">
      <h2>Repetidos e intercambio</h2>
      <p class="muted small">Indica tus repetidos en la ficha de cada libro. Si activas el intercambio, otros Mecenas que también lo
        tengan activado verán tu nombre y tu contacto cuando tengas algo de su lista de deseos, y tú verás los suyos.</p>
      <form class="form trade-form">
        <label class="switch"><input type="checkbox" name="trade_opt_in" ${profile.trade_opt_in ? 'checked' : ''}> <span>Participar en el intercambio</span></label>
        <label>Cómo contactarte (Telegram, email…) <input name="trade_contact" maxlength="120" value="${profile.trade_contact ?? ''}" placeholder="@usuario en Telegram"></label>
        <div class="actions"><button class="btn btn-ghost">Guardar</button></div>
      </form>
      ${profile.trade_opt_in ? raw(trades.length ? html`<h3 class="subhead">Tienen repetido algo de tu lista</h3>
        <ul class="rows">${trades.map((t) => raw(html`<li class="row"><a class="row-title" href="#/libro/${t.catalog_id}">${t.code ? `${t.code} · ` : ''}${t.title}
          <small>${t.owner_name}${t.contact ? ` · ${t.contact}` : ''}</small></a></li>`))}</ul>`
        : html`<p class="muted small">Por ahora ningún Mecenas tiene repetido nada de tu lista de deseos.</p>`) : ''}
    </section>

    <section class="panel" id="sec-prestamos">
      <h2>Prestados ahora</h2>
      <p class="muted small how">Se registran desde la ficha de un libro que tengas: «Préstamos» → «Prestar».</p>
      ${active.length ? raw(html`<ul class="rows">${active.map((l) => {
        const b = bookById(l.catalog_id);
        return raw(html`<li class="row"><a class="row-title" href="#/libro/${l.catalog_id}">${b?.title ?? '—'}<small>A ${l.lent_to} desde el ${fmtShort(l.lent_at)}</small></a></li>`);
      })}</ul>`) : raw('<p class="muted">Ningún libro prestado.</p>')}
    </section>

    <section class="panel" id="sec-exportar">
      <h2>Exportar</h2>
      <p class="muted small how">Descarga tu biblioteca con estado, notas y fecha de registro.</p>
      <div class="actions">
        <button class="btn btn-ghost" data-csv>Descargar CSV</button>
        <button class="btn btn-ghost" data-json>Descargar JSON</button>
      </div>
    </section>

    ${settings.donations_enabled ? raw(html`<section class="panel coffee">
      <p>¿Quieres volver a invitar a un café? Siempre se agradece.</p>
      <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">${raw(icon('coffee'))} Invítame a un café</a>
    </section>`) : ''}`;

  if (params.section) {
    const target = $(`#sec-${params.section}`, root);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const setProfile = async (fields, msg) => {
    try {
      await api.updateProfile(uid, fields);
      await loadAll();
      if (msg) toast(msg, 'ok');
      renderSupporter(root);
    } catch (err) { toast(err.message, 'error'); }
  };
  $('[data-share-on]', root)?.addEventListener('click', () => { track('wishlist_share'); setProfile({ share_token: crypto.randomUUID() }, 'Enlace creado'); });
  $('[data-share-off]', root)?.addEventListener('click', () => setProfile({ share_token: null }, 'Ya no se comparte'));
  $('[data-share-copy]', root)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast('Enlace copiado', 'ok'); } catch { /* sin portapapeles */ }
  });
  $('.trade-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setProfile({ trade_opt_in: f.get('trade_opt_in') === 'on', trade_contact: f.get('trade_contact').trim() || null }, 'Guardado');
  });

  $('[data-json]', root).onclick = () => downloadAllJson();
  $('[data-csv]', root).onclick = () => downloadLibraryCsv();
}

function renderPitch(root) {
  const email = user().email;
  if (!settings.donations_enabled) {
    root.innerHTML = html`${raw(viewHeader('Mecenas'))}<div class="empty"><h2>Las donaciones están pausadas</h2>
      <p class="muted">Por ahora no se aceptan nuevas aportaciones. La app sigue siendo gratuita para todos.</p>
      <a class="btn btn-ghost" href="#/perfil">Volver al perfil</a></div>`;
    return;
  }
  root.innerHTML = html`
    ${raw(viewHeader('Hazte Mecenas', 'La app es y seguirá siendo gratuita. Si quieres apoyarla, llévate unos extras.'))}

    <section class="panel">
      <ul class="perks">
        ${PERKS.map(([icon, t, d]) => raw(html`<li><span class="perk-icon" aria-hidden="true">${icon}</span><div><strong>${t}</strong><p class="muted small">${d}</p></div></li>`))}
      </ul>
    </section>

    <section class="panel">
      <h2>Cómo activarlo</h2>
      <ol class="steps">
        <li>Invítame a <strong>un café (${SUPPORTER_MIN_AMOUNT} €)</strong> en Buy Me a Coffee: pago único, Mecenas para siempre.</li>
        <li>Paga con el mismo email de tu cuenta de Google, <strong>o escribe este email en el mensaje</strong>:
          <code class="copy" tabindex="0" title="Toca para copiar">${email}</code></li>
        <li>Se activa solo en unos segundos. Pulsa «Ya he donado» para comprobarlo.</li>
      </ol>
      <div class="actions">
        <button class="btn btn-ghost" data-check>Ya he donado</button>
        <a class="btn btn-coffee" href="${DONATION_URL}" target="_blank" rel="noopener">${raw(icon('coffee'))} Ir a Buy Me a Coffee</a>
      </div>
    </section>`;

  $('.copy', root).onclick = async () => {
    try { await navigator.clipboard.writeText(email); toast('Email copiado', 'ok'); } catch { /* sin portapapeles */ }
  };
  $('[data-check]', root).onclick = async (e) => {
    e.target.disabled = true;
    await loadAll();
    if (isSupporter()) { toast('¡Gracias! Ya eres Mecenas ★', 'ok'); renderSupporter(root); }
    else { toast('Aún no nos ha llegado. Si pasa un rato, escríbenos con tu recibo de Buy Me a Coffee.'); e.target.disabled = false; }
  };
}
