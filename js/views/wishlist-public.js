import { html, raw, $ } from '../util.js';
import { publicWishlist } from '../api.js';

/** Lista de deseos compartida por enlace (#/deseos/<token>): se ve sin iniciar sesión. */
export async function renderPublicWishlist(root, token) {
  root.innerHTML = '<div class="loading" aria-busy="true">Cargando la lista…</div>';
  let rows = [];
  try { rows = await publicWishlist(token); } catch { rows = []; }
  const owner = rows[0]?.owner_name;

  root.innerHTML = html`
    <article class="public-wishlist panel">
      <img src="assets/icons/seal.svg" alt="" width="56" height="56" class="pw-seal">
      ${rows.length ? raw(html`
        <h1>Lista de deseos${owner ? ` de ${owner}` : ''}</h1>
        <p class="muted">Libros de <em>Aventuras en la Marca del Este</em> que le faltan en su colección.</p>
        <ul class="rows">${rows.map((r) => raw(html`<li class="row"><span class="row-title">${r.code ? raw(html`<span class="code">${r.code}</span> `) : ''}${r.title}<small>${r.category ?? ''}</small></span></li>`))}</ul>`)
      : raw(html`<h1>Lista no disponible</h1>
        <p class="muted">El enlace no es válido, ya no se comparte o la lista está vacía.</p>`)}
      <p class="small center pad">Hecha con <a href="./">Escriba de la Marca</a>, la app para coleccionistas de la Marca del Este.</p>
    </article>`;
}
