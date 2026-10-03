// Comunidad: Escribas (quienes más aportan al catálogo) y Mecenas (quienes sostienen la app). Aparecer es voluntario
// (casillas en Perfil); solo se muestra el nombre abreviado, el emblema y el nivel. De los Mecenas, nunca cantidades.
import { html, raw, $ } from '../util.js';
import { state, isSupporter } from '../store.js';
import { viewHeader, errMsg } from '../ui.js';
import { icon } from '../icons.js';
import { rankOf, levelOf } from '../achievements.js';
import { emblemBadge } from '../hero.js';
import { getScribes, getSupporters } from '../api.js';

const since = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const TABS = [['escribas', 'Escribas'], ['mecenas', 'Mecenas']];

export async function renderCommunity(root, params = {}) {
  const tab = params.tab === 'mecenas' ? 'mecenas' : 'escribas';
  const p = state.profile || {};
  root.innerHTML = html`
    ${raw(viewHeader('Comunidad', 'Gracias a quienes hacen crecer Escriba de la Marca'))}
    <nav class="seg community-tabs" aria-label="Comunidad">${TABS.map(([id, label]) => raw(html`<a href="#/comunidad/${id}"
      class="${id === tab ? 'on' : ''}" ${id === tab ? raw('aria-current="page"') : ''}>${label}</a>`))}</nav>
    <section class="panel community-intro">${tab === 'escribas'
      ? raw(html`<p class="small">Cada código propuesto al escanear, cada corrección y cada libro que faltaba, una vez revisados, es una
          aportación al catálogo de todos. Aquí, quienes más han aportado.</p>
        ${p.show_in_scribes ? '' : raw('<p class="small"><a href="#/ajustes">Actívalo en Ajustes → Privacidad</a> para aparecer (es voluntario).</p>')}`)
      : raw(html`<p class="small">Escriba de la Marca es gratuita y se mantiene con cafés. Estos Mecenas la sostienen: sin cantidades,
          por orden de llegada.</p>
        ${isSupporter() && !p.show_in_supporters ? raw('<p class="small"><a href="#/ajustes">Actívalo en Ajustes → Privacidad</a> para aparecer (es voluntario).</p>') : ''}
        ${isSupporter() ? '' : raw('<p class="small"><a href="#/mecenas">¿Cómo hacerse Mecenas?</a></p>')}`)}
    </section>
    <ol class="community-list panel"><li class="muted small">Cargando…</li></ol>`;

  const list = $('.community-list', root);
  let rows;
  try { rows = tab === 'escribas' ? await getScribes() : await getSupporters(); } catch (err) {
    list.innerHTML = html`<li class="muted small">No se pudo cargar la lista: ${errMsg(err)}</li>`;
    return;
  }
  if (!rows.length) {
    list.innerHTML = html`<li class="community-empty">${raw(icon(tab === 'escribas' ? 'quill' : 'coffee'))}
      <p class="muted small">${tab === 'escribas'
        ? 'Aún no hay nadie. ¡Propón un código o una corrección y sé el primer escriba de la lista!'
        : 'Aún no hay nadie en la lista.'}</p></li>`;
    return;
  }
  list.innerHTML = rows.map((r, i) => {
    const level = r.level ?? levelOf(r.xp ?? 0);
    const me = r.is_me ? raw(' <span class="badge">Tú</span>') : '';
    if (tab === 'mecenas') {
      return html`<li class="member ${r.is_me ? 'is-me' : ''}">
        ${raw(emblemBadge(r.emblem, { size: 'md', gold: true }))}
        <div class="member-body"><strong>${r.name}${me}</strong>
          <small>Nivel ${level}${r.since ? ` · Mecenas desde ${since.format(new Date(r.since))}` : ''}</small></div>
      </li>`;
    }
    const parts = [
      r.codes && `${r.codes} ${r.codes === 1 ? 'código' : 'códigos'}`,
      r.suggestions && `${r.suggestions} ${r.suggestions === 1 ? 'corrección' : 'correcciones'}`,
      r.books && `${r.books} ${r.books === 1 ? 'libro' : 'libros'}`,
    ].filter(Boolean).join(' · ');
    return html`<li class="member ${r.is_me ? 'is-me' : ''}">
      <span class="member-pos" aria-label="Puesto ${i + 1}">${i + 1}</span>
      ${raw(emblemBadge(r.emblem, { size: 'md', gold: r.supporter }))}
      <div class="member-body">
        <strong>${r.name}${me}${r.supporter ? raw(` <span class="member-star" title="Mecenas">${icon('star', { label: 'Mecenas' })}</span>`) : ''}</strong>
        <small>Nivel ${level} · ${rankOf(r.xp ?? 0).name}</small>
        <small class="muted">${parts}</small>
      </div>
      <span class="member-total" aria-label="${r.total} aportaciones">${r.total}</span>
    </li>`;
  }).join('');
}
