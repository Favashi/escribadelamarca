// Lista de deseos (para todos): libros que te faltan y quieres conseguir, con un enlace para compartirla.
// Cada lista compartida lleva a la app a quien la abre (#/deseos/<token>, con «Crea la tuya»).
import { html, raw, $, cover, toast } from '../util.js';
import { state, user, bookById, categoryName, compareBooks, loadAll } from '../store.js';
import { viewHeader, errMsg } from '../ui.js';
import { icon } from '../icons.js';
import * as api from '../api.js';
import { track } from '../track.js';
import { setNavList } from '../navlist.js';

export function renderWishlist(root) {
  const uid = user().id;
  const wishes = [...state.wishlist].map(bookById).filter((b) => b && !state.library.has(b.id)).sort(compareBooks);
  const token = state.profile?.share_token;
  const shareUrl = token ? `${location.origin}${location.pathname}#/deseos/${token}` : '';
  setNavList(wishes.map((b) => b.id), 'Lista de deseos');

  root.innerHTML = html`
    ${raw(viewHeader('Lista de deseos', wishes.length ? `${wishes.length} ${wishes.length === 1 ? 'libro' : 'libros'} que quieres conseguir` : ''))}
    <section class="panel">
      ${wishes.length ? raw(html`<ul class="rows">${wishes.map((b) => raw(html`<li class="row">${raw(cover(b, 'cover-xs'))}
          <a class="row-title" href="#/libro/${b.id}">${b.code ? raw(html`<span class="code">${b.code}</span> `) : ''}${b.title}<small>${categoryName(b.category_id)}</small></a></li>`))}</ul>`)
        : raw(html`<p class="muted">Vacía. Abre un libro que te falte y pulsa «☆ Lo quiero». Cuando lo consigas y lo añadas
          a tu biblioteca, sale solo de la lista.</p>`)}
    </section>

    <section class="panel share-box">
      <h2>${raw(icon('people'))} Compártela</h2>
      <p class="muted small">Un enlace para que tu grupo o tu familia sepan qué regalarte. Quien lo abra verá tu nombre y
        los títulos, nada más, y puedes dejar de compartirla cuando quieras.</p>
      ${shareUrl ? raw(html`
        <div class="inline-form"><input readonly value="${shareUrl}" aria-label="Enlace de tu lista de deseos">
          <button class="btn btn-ghost" data-share-copy>Copiar</button></div>
        <div class="actions">
          ${navigator.share ? raw('<button class="btn btn-primary" data-share-native>Compartir…</button>') : ''}
          <button class="link btn-danger-text" data-share-off>Dejar de compartir</button>
        </div>`)
        : raw('<button class="btn btn-primary" data-share-on>Crear enlace para compartir</button>')}
    </section>`;

  const setToken = async (value, msg) => {
    try {
      await api.updateProfile(uid, { share_token: value });
      await loadAll();
      toast(msg, 'ok');
      renderWishlist(root);
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  $('[data-share-on]', root)?.addEventListener('click', () => { track('wishlist_share'); setToken(crypto.randomUUID(), 'Enlace creado'); });
  $('[data-share-off]', root)?.addEventListener('click', () => setToken(null, 'Ya no se comparte'));
  $('[data-share-copy]', root)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast('Enlace copiado', 'ok'); } catch { /* sin portapapeles */ }
  });
  $('[data-share-native]', root)?.addEventListener('click', () => {
    navigator.share({ title: 'Mi lista de deseos de la Marca del Este', url: shareUrl }).catch(() => {});
  });
}
