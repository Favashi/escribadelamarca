// Página «Escribas»: agradecimiento voluntario a quienes más aportan al catálogo (opt-in en Perfil).
import { html, raw, $ } from '../util.js';
import { state } from '../store.js';
import { viewHeader, errMsg } from '../ui.js';
import { icon } from '../icons.js';
import { rankOf } from '../achievements.js';
import { getScribes } from '../api.js';

export async function renderScribes(root) {
  const optedIn = !!state.profile?.show_in_scribes;
  root.innerHTML = html`
    ${raw(viewHeader('Escribas de la Marca', 'Gracias a quienes ayudan a completar el catálogo'))}
    <section class="panel scribes-intro">
      <p class="small">Cada código propuesto al escanear, cada corrección y cada libro que faltaba, una vez revisados, suman una
        aportación. Aparecer aquí es <strong>voluntario</strong>: solo se muestra quien lo activa en su perfil, con el nombre abreviado.</p>
      ${optedIn ? '' : raw(html`<p class="small"><a href="#/perfil">Actívalo en Perfil → Rango de escriba</a> para aparecer.</p>`)}
    </section>
    <ol class="scribes-list panel"><li class="muted small">Cargando…</li></ol>
    <div class="center pad"><a class="btn btn-ghost btn-sm" href="#/perfil">Volver al perfil</a></div>`;

  const list = $('.scribes-list', root);
  let rows;
  try { rows = await getScribes(); } catch (err) {
    list.innerHTML = html`<li class="muted small">No se pudo cargar la lista: ${errMsg(err)}</li>`;
    return;
  }
  if (!rows.length) {
    list.innerHTML = html`<li class="scribes-empty">${raw(icon('quill'))}
      <p class="muted small">Aún no hay nadie. ¡Propón un código o una corrección y sé el primer escriba de la lista!</p></li>`;
    return;
  }
  list.innerHTML = rows.map((r, i) => {
    const rank = rankOf(r.total).name;
    const parts = [
      r.codes && `${r.codes} ${r.codes === 1 ? 'código' : 'códigos'}`,
      r.suggestions && `${r.suggestions} ${r.suggestions === 1 ? 'corrección' : 'correcciones'}`,
      r.books && `${r.books} ${r.books === 1 ? 'libro' : 'libros'}`,
    ].filter(Boolean).join(' · ');
    return html`<li class="scribe ${r.is_me ? 'is-me' : ''}">
      <span class="scribe-pos" aria-label="Puesto ${i + 1}">${i + 1}</span>
      <div class="scribe-body">
        <strong>${r.name}${r.is_me ? raw(' <span class="badge">Tú</span>') : ''}</strong>
        <small>${rank} · ${parts}</small>
      </div>
      <span class="scribe-total" aria-label="${r.total} aportaciones">${r.total}</span>
    </li>`;
  }).join('');
}
