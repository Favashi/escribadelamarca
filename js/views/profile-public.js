// Perfil público de escriba (#/escriba/<slug>), estilo Steam: se ve sin cuenta. Lo activa y personaliza cada usuario
// en Perfil → Perfil público (portada de fondo, tema, título, lema, logros destacados y secciones visibles).
// Los datos salen de public_profile(slug), que solo devuelve lo que el usuario decide enseñar.
import { html, raw, $, toast } from '../util.js';
import { RANKS, rankOf, xpForLevel, describe } from '../achievements.js';
import { emblemSvg } from '../emblems.js';
import { emblemBadge } from '../hero.js';
import { supabase } from '../supabase.js';
import { state, user, isSupporter } from '../store.js';
import { updateProfile } from '../api.js';
import { errMsg } from '../ui.js';

// ---------- Temas: dos gratuitos y tres de Mecenas ----------
export const PROFILE_THEMES = [
  { id: 'oro', name: 'Oro y púrpura' },
  { id: 'bosque', name: 'Bosque de Valion' },
  { id: 'sangre', name: 'Sangre de dragón', supporter: true },
  { id: 'arcano', name: 'Arcano', supporter: true },
  { id: 'escarcha', name: 'Escarcha del Norte', supporter: true },
];

// ---------- Medallas: icono de fantasía y rareza de cada logro ----------
const TIERS = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', epic: 'Épico' };
const RANK_ICONS = ['quill-ink', 'quill-ink', 'owl', 'crystal-ball', 'dragon-head'];
const RANK_TIERS = ['bronze', 'bronze', 'silver', 'gold', 'epic'];

/** { icon, tier } de un logro guardado (clave «books:25», «series:B», «rank:3»…). */
export function medalOf(key) {
  const [kind, arg] = key.split(':');
  if (kind === 'first_book') return { icon: 'scroll-unfurled', tier: 'bronze' };
  if (kind === 'books') return { icon: 'spell-book', tier: { 10: 'bronze', 25: 'silver', 50: 'gold', 100: 'epic' }[arg] || 'bronze' };
  if (kind === 'explorer') return { icon: 'compass', tier: 'silver' };
  if (kind === 'series') return { icon: 'castle', tier: 'gold' };
  if (kind === 'rank') return { icon: RANK_ICONS[Number(arg)] || 'quill-ink', tier: RANK_TIERS[Number(arg)] || 'bronze' };
  return { icon: 'treasure-map', tier: 'bronze' };
}

/** Logros fijos para la vitrina (los de serie dependen del catálogo y solo se enseñan conseguidos). */
const SHOWCASE = ['first_book', 'books:10', 'books:25', 'books:50', 'books:100', 'explorer', 'rank:1', 'rank:2', 'rank:3', 'rank:4'];

export function medalHtml(key, { earned = true, size = '', meta } = {}) {
  const m = medalOf(key);
  const d = describe(key, { meta });
  return html`<div class="pp-medal ${m.tier} ${size} ${earned ? '' : 'locked'}" title="${d.title}">
    <span class="pp-tier">${TIERS[m.tier]}</span>
    <span class="pp-m" aria-hidden="true">${raw(emblemSvg(m.icon))}</span>
    <strong>${earned ? d.title : '?'}</strong>${earned && d.text ? raw(html`<small>${d.text}</small>`) : ''}</div>`;
}

// ---------- Títulos: se desbloquean con logros ----------
const BOOK_TITLES = { 10: 'Dueño de una estantería', 25: 'Bibliotecario de Robleda', 50: 'Archivero de la Marca', 100: 'Gran Bibliotecario de Valion' };

/** Texto del título de un logro (o del Mecenazgo). */
export function titleText(key) {
  if (!key) return '';
  if (key === 'supporter') return 'Mecenas de la Marca';
  const [kind, arg] = key.split(':');
  if (kind === 'first_book') return 'Aventurero novel';
  if (kind === 'books') return BOOK_TITLES[arg] || '';
  if (kind === 'explorer') return 'Explorador de la Frontera';
  if (kind === 'series') return `Guardián de la Serie ${arg}`;
  if (kind === 'rank') return RANKS[Number(arg)]?.name ?? '';
  return '';
}

/** Títulos que puede elegir alguien con estos logros. */
export function availableTitles(keys, supporter) {
  return [...(supporter ? ['supporter'] : []), ...keys].map((k) => ({ key: k, text: titleText(k) })).filter((t) => t.text);
}

// ---------- Página pública ----------
const since = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const num = (n) => Number(n || 0).toLocaleString('es-ES');

export async function renderPublicProfile(root, slug) {
  root.innerHTML = '<div class="loading" aria-busy="true">Abriendo el perfil…</div>';
  let p = null;
  try {
    const { data, error } = await supabase.rpc('public_profile', { p_slug: slug });
    if (error) throw error;
    p = data;
  } catch { p = null; }
  if (!p) {
    root.innerHTML = html`<div class="empty"><h2>Perfil no disponible</h2>
      <p class="muted">El enlace no es válido o este escriba ya no comparte su perfil.</p>
      <a class="btn btn-primary" href="./">Ir a Escriba de la Marca</a></div>`;
    return;
  }
  const rank = rankOf(p.xp);
  const from = xpForLevel(p.level), to = xpForLevel(p.level + 1);
  const pct = Math.round(((p.xp - from) / (to - from)) * 100);
  const earned = new Map(p.achievements.map((a) => [a.key, a]));
  const series = p.series || [];
  const complete = series.filter((s) => s.owned === s.total).length;
  const c = p.contributions;
  const contribTotal = c ? c.game + c.summary + c.fix + c.code + c.book : 0;
  const featured = (p.featured.length ? p.featured : p.achievements.slice(-3).map((a) => a.key).reverse()).slice(0, 3);
  const vitrina = [...p.achievements.filter((a) => a.key.startsWith('series:')).map((a) => a.key),
    ...SHOWCASE];
  const stat = (icon, n, label) => html`<div class="pp-stat"><span class="pp-ic" aria-hidden="true">${raw(emblemSvg(icon))}</span>
    <div><b>${num(n)}</b><span>${label}</span></div></div>`;
  const url = `${location.origin}${location.pathname}#/escriba/${slug}`;

  root.innerHTML = html`
    <article class="pp pp-t-${p.theme}">
      <section class="pp-hero">
        <div class="pp-art" ${p.banner ? raw(html`style="background-image:url('${p.banner}')"`) : ''}></div>
        <div class="pp-inner">
          <div class="pp-emb">${raw(emblemBadge(p.emblem, { size: 'lg', gold: p.supporter }))}<b class="pp-lvl" aria-label="Nivel ${p.level}">${p.level}</b></div>
          <div class="pp-id">
            <h1>${p.name}</h1>
            <p class="pp-title">${titleText(p.title) || rank.name}</p>
            ${p.motto ? raw(html`<p class="pp-motto">«${p.motto}»</p>`) : ''}
            <div class="pp-xp"><i><b style="width:${pct}%"></b></i>
              <span>Nivel ${p.level} · ${rank.name} · ${num(p.xp)} / ${num(to)} PX · escriba desde ${since.format(new Date(p.since))}</span></div>
          </div>
        </div>
      </section>
      <div class="pp-wrap">
        <div class="pp-actions">
          <button type="button" class="pp-btn primary" data-copy>Copiar enlace</button>
          ${navigator.share ? raw('<button type="button" class="pp-btn" data-share>Compartir</button>') : ''}
          ${p.supporter ? raw('<span class="pp-badge">★ Mecenas</span>') : ''}
        </div>

        ${featured.length ? raw(html`<h2 class="pp-sec">Logros destacados</h2>
          <div class="pp-feat">${featured.map((k) => raw(medalHtml(k, { size: 'big', meta: earned.get(k)?.meta })))}</div>`) : ''}

        <h2 class="pp-sec">Hoja de servicio</h2>
        <div class="pp-stats">
          ${raw(stat('spell-book', p.books, 'libros'))}
          ${p.series ? raw(stat('castle', complete, complete === 1 ? 'serie completa' : 'series completas')) : ''}
          ${p.plays ? raw(stat('dice-twenty-faces-twenty', p.plays.played, 'jugadas')) : ''}
          ${p.plays ? raw(stat('wizard-staff', p.plays.directed, 'dirigidas')) : ''}
          ${c ? raw(stat('quill-ink', contribTotal, 'aportaciones')) : ''}
        </div>

        ${series.length ? raw(html`<h2 class="pp-sec">Series <small>completas y en curso</small></h2>
          <div class="pp-series">${series.map((s) => raw(html`<div class="pp-srow ${s.owned === s.total ? 'done' : ''}">
            <header><b>Serie ${s.series}</b><em>${s.owned} / ${s.total}${s.owned === s.total ? ' ✦' : ''}</em></header>
            <div class="pp-strip">${s.books.map((b) => raw(b.owned
              ? (b.cover_url ? html`<span title="${b.code ?? ''}" style="background-image:url('${b.cover_url}')"></span>` : html`<span class="ph" title="${b.code ?? ''}">${b.code ?? ''}</span>`)
              : html`<span class="miss" title="Le falta ${b.code ?? ''}"></span>`))}</div></div>`))}</div>`) : ''}

        <h2 class="pp-sec">Vitrina <small>${p.achievements.length} logros</small></h2>
        <div class="pp-all">${vitrina.map((k) => raw(medalHtml(k, { earned: earned.has(k), meta: earned.get(k)?.meta })))}</div>

        ${c ? raw(html`<h2 class="pp-sec">Aportaciones al catálogo</h2>
          <div class="pp-contrib">
            <div><b>${c.game}</b><span>datos de juego</span></div><div><b>${c.summary}</b><span>resúmenes</span></div>
            <div><b>${c.code}</b><span>códigos de barras</span></div><div><b>${c.fix + c.book}</b><span>correcciones y libros</span></div>
          </div>`) : ''}

        ${p.shelf?.length ? raw(html`<h2 class="pp-sec">Estantería <small>últimos añadidos</small></h2>
          <div class="pp-shelf">${p.shelf.map((b) => raw(b.cover_url
            ? html`<img src="${b.cover_url}" alt="${b.title}" loading="lazy">`
            : html`<span class="ph">${b.code ?? ''}</span>`))}</div>`) : ''}

        <section class="pp-visitor">
          <h3>¿Tú también coleccionas la Marca?</h3>
          <p>Crea tu colección, escanea tus libros, mira qué te falta y consigue tus propios logros.</p>
          <a class="btn btn-google" href="./?ref=perfil-publico">Crea tu colección gratis</a>
        </section>
      </div>
    </article>`;

  $('[data-copy]', root).onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado', 'ok'); } catch { toast(url); }
  };
  $('[data-share]', root)?.addEventListener('click', () => navigator.share({ title: `${p.name} · Escriba de la Marca`, url }).catch(() => {}));
}

// ---------- Ajustes en Perfil → Perfil público (solo el dueño) ----------
const THEME_SWATCH = { oro: '#f3c02f', bosque: '#9be15d', sangre: '#ff6b4a', arcano: '#7fd6ff', escarcha: '#d6f1ff' };
const DEFAULT_SHOW = { series: true, contributions: true, plays: true, shelf: false };
const SHOW_LABELS = [['series', 'Series y lo que me falta'], ['contributions', 'Aportaciones al catálogo'],
  ['plays', 'Jugadas y dirigidas'], ['shelf', 'Mi estantería (últimos libros añadidos)']];

/** «Ana García» → «ana-garcia» (para proponer la dirección del perfil). */
export const slugify = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');

export function profileSettingsHtml() {
  const p = state.profile || {};
  const supporter = isSupporter();
  const keys = state.achievements.map((a) => a.key);
  const titles = availableTitles(keys, supporter);
  const show = { ...DEFAULT_SHOW, ...(p.profile_show || {}) };
  const covers = state.catalog.filter((b) => state.library.has(b.id) && b.cover_url);
  const slug = p.public_slug || slugify(p.public_name || p.display_name) || '';
  const base = `${location.origin}${location.pathname}#/escriba/`;
  return html`<form class="form pp-settings" data-pp-form>
    <p class="muted small">Una página pública con tu nivel, logros y series, para compartir con tu grupo. Nunca enseña tu
      correo ni tu nombre de Google. Puedes desactivarla cuando quieras.</p>
    <label class="switch"><input type="checkbox" name="public_profile" ${p.public_profile ? 'checked' : ''}> <span>Perfil público activado</span></label>
    <label>Dirección
      <span class="pp-url"><span class="muted">…/#/escriba/</span><input name="public_slug" value="${slug}" maxlength="30"
        autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Dirección del perfil"></span>
    </label>
    <div><span class="muted small">Portada de fondo (de tus libros)</span>
      ${covers.length ? raw(html`<div class="pp-covers">${covers.map((b) => raw(html`<label title="${b.title}">
        <input type="radio" name="profile_banner" value="${b.id}" ${p.profile_banner === b.id ? 'checked' : ''}>
        <img src="${b.cover_url}" alt="${b.title}" loading="lazy"></label>`))}</div>`)
        : raw('<p class="muted small">Añade libros a tu biblioteca para elegir una portada.</p>')}</div>
    <div><span class="muted small">Tema de color${supporter ? '' : ' · los marcados con ★ son de Mecenas'}</span>
      <div class="pp-themes">${PROFILE_THEMES.map((t) => raw(html`<label>
        <input type="radio" name="profile_theme" value="${t.id}" ${(p.profile_theme || 'oro') === t.id ? 'checked' : ''} ${t.supporter && !supporter ? 'disabled' : ''}>
        <span><i style="background:${THEME_SWATCH[t.id]}"></i>${t.supporter ? '★ ' : ''}${t.name}</span></label>`))}</div></div>
    <label>Título <select name="profile_title">
      <option value="">Tu rango de escriba</option>
      ${titles.map((t) => raw(html`<option value="${t.key}" ${p.profile_title === t.key ? 'selected' : ''}>${t.text}</option>`))}
    </select><small class="muted">Se desbloquean más con tus logros: series completas, hitos de colección, rangos…</small></label>
    <label>Lema <input name="profile_motto" maxlength="80" value="${p.profile_motto ?? ''}" placeholder="Ningún módulo queda sin leer."></label>
    ${keys.length ? raw(html`<fieldset class="game-fields"><legend>Logros destacados (hasta 3)</legend><div class="pp-featured">
      ${keys.map((k) => raw(html`<label class="switch"><input type="checkbox" name="featured" value="${k}" ${(p.profile_featured || []).includes(k) ? 'checked' : ''}>
        <span>${describe(k).title}</span></label>`))}</div></fieldset>`) : ''}
    <fieldset class="game-fields"><legend>Qué enseña tu perfil</legend>
      ${SHOW_LABELS.map(([k, label]) => raw(html`<label class="switch"><input type="checkbox" name="show_${k}" ${show[k] ? 'checked' : ''}> <span>${label}</span></label>`))}
    </fieldset>
    <div class="actions">
      ${p.public_profile && p.public_slug ? raw(html`<a class="btn btn-ghost" href="${base}${p.public_slug}">Ver mi perfil</a>`) : ''}
      <button class="btn btn-primary">Guardar</button>
    </div>
  </form>`;
}

export function bindProfileSettings(root, rerender) {
  const form = $('[data-pp-form]', root);
  if (!form) return;
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'featured') return;
    if (form.querySelectorAll('input[name=featured]:checked').length > 3) { e.target.checked = false; toast('Elige como mucho 3 logros', 'error'); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const slug = slugify(f.get('public_slug'));
    const enabled = f.get('public_profile') === 'on';
    if (enabled && slug.length < 3) { toast('La dirección necesita al menos 3 letras o números', 'error'); return; }
    const fields = {
      public_profile: enabled,
      public_slug: slug.length >= 3 ? slug : null,
      profile_banner: f.get('profile_banner') || null,
      profile_theme: f.get('profile_theme') || 'oro',
      profile_title: f.get('profile_title') || null,
      profile_motto: String(f.get('profile_motto') || '').trim().replace(/^«|»$/g, '') || null,
      profile_featured: f.getAll('featured').slice(0, 3),
      profile_show: Object.fromEntries(SHOW_LABELS.map(([k]) => [k, f.get(`show_${k}`) === 'on'])),
    };
    try {
      await updateProfile(user().id, fields);
      Object.assign(state.profile, fields);
      toast(enabled ? 'Perfil público guardado' : 'Perfil público desactivado', 'ok');
      rerender();
    } catch (err) {
      toast(err?.code === '23505' ? 'Esa dirección ya la usa otro escriba: prueba con otra' : errMsg(err), 'error');
    }
  });
}
