// Perfil: tu ficha de escriba (emblema, nombre, nivel, perfil público), atajos y logros. Todo lo configurable está en
// Ajustes (#/ajustes, la rueda dentada).
import { html, raw, $ } from '../util.js';
import { state, isSupporter, isAdmin } from '../store.js';
import { icon } from '../icons.js';
import { emblemSvg } from '../emblems.js';
import { levelInfo } from '../achievements.js';
import { emblemBadge, emblemDialog, heroSheet } from '../hero.js';
import { portraitHtml, portraitDialog } from '../portraits.js';
import { medalHtml } from './profile-public.js';
import { myContributions } from './contributions.js';
import { getAchievements } from '../api.js';
import { settings } from '../settings.js';
import { APP_VERSION } from '../version.js';

const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></g></svg>';
const SHOWCASE = ['first_book', 'books:10', 'books:25', 'books:50', 'books:100', 'explorer', 'rank:1', 'rank:2', 'rank:3', 'rank:4'];

const tile = (href, iconName, title, sub, cls = '') => html`<a class="prof-tile ${cls}" href="${href}">
  <span class="prof-ic" aria-hidden="true">${raw(emblemSvg(iconName))}</span><span><b>${title}</b><small>${sub}</small></span></a>`;

export function renderProfile(root) {
  const p = state.profile ?? {};
  const supporter = isSupporter();
  const info = levelInfo();
  const name = p.public_name || p.display_name || state.session.user.email;
  const pending = myContributions().filter((c) => c.status === 'pending').length;
  const wishes = state.wishlist.size;
  const base = `${location.origin}${location.pathname}#/escriba/`;

  root.innerHTML = html`
    <header class="prof-top"><h1>Perfil</h1>
      <a class="prof-gear" href="#/ajustes" aria-label="Ajustes">${raw(GEAR)}</a></header>

    <section class="prof-card">
      <div class="prof-id">
        <button type="button" class="prof-emb" data-emblem aria-label="Cambiar retrato o emblema">
          ${raw(p.portrait ? portraitHtml(p.portrait, { style: p.portrait_style }) : emblemBadge(p.emblem, { size: 'lg', gold: supporter }))}<b class="prof-lvl" aria-hidden="true">${info.level}</b></button>
        <div class="prof-name">
          <a href="#/ajustes/nombre" class="prof-h" aria-label="Cambiar el nombre público"><h2>${name}</h2><span aria-hidden="true">✎</span></a>
          <p class="prof-rank">${info.rank.name}${p.profile_motto ? ` · «${p.profile_motto}»` : ''}</p>
          ${supporter || isAdmin() ? raw(html`<p class="prof-badges">${supporter ? raw(`<span>${icon('star')} Mecenas</span>`) : ''}${isAdmin() ? raw('<span>Admin</span>') : ''}</p>`) : ''}
        </div>
      </div>
      <button type="button" class="prof-xp" data-hero-open aria-label="Nivel ${info.level}: ver tu progreso">
        <i><b style="width:${info.pct}%"></b></i>
        <span>Nivel ${info.level} · ${info.xp.toLocaleString('es-ES')} / ${info.to.toLocaleString('es-ES')} PX · te faltan ${(info.to - info.xp).toLocaleString('es-ES')} para el nivel ${info.level + 1}</span>
      </button>
      ${p.public_profile && p.public_slug
        ? raw(html`<a class="prof-pub" href="${base}${p.public_slug}"><span>Ver mi perfil público<small>…/#/escriba/${p.public_slug}</small></span>${raw(icon('chevron'))}</a>`)
        : raw(html`<a class="prof-pub" href="#/ajustes/perfil-publico"><span>Crear mi perfil público<small>Una página para compartir tu nivel, logros y series</small></span>${raw(icon('chevron'))}</a>`)}
    </section>

    <div class="prof-tiles">
      ${raw(tile('#/deseos', 'treasure-map', 'Lista de deseos', wishes ? `${wishes} ${wishes === 1 ? 'libro' : 'libros'}` : 'Apunta lo que te falta'))}
      ${raw(tile('#/aportaciones', 'quill-ink', 'Aportaciones', pending ? `${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}` : 'Misiones y propuestas'))}
      ${raw(tile('#/comunidad', 'crown', 'Comunidad', 'Escribas y Mecenas'))}
      ${supporter ? raw(tile('#/mecenas', 'beer-stein', 'Extras de Mecenas', 'Diario, préstamos…', 'gold'))
        : settings.donations_enabled ? raw(tile('#/mecenas', 'beer-stein', 'Hazte Mecenas', 'Con un café', 'gold'))
        : raw(tile('#/ayuda', 'compass', 'Ayuda', 'Preguntas frecuentes'))}
    </div>

    <div class="prof-sec"><h2>Logros</h2><button type="button" class="link" data-all-ach hidden>Ver todos</button></div>
    <div class="prof-medals"><p class="muted small">Cargando…</p></div>
    <p class="muted small center pad">Escriba de la Marca v${APP_VERSION}</p>`;

  $('[data-emblem]', root).onclick = async () => { if (await portraitDialog({ onEmblem: emblemDialog })) renderProfile(root); };
  $('[data-hero-open]', root).onclick = () => heroSheet();
  fillMedals(root);
}

/** Logros: fila de medallas (los conseguidos, de los más recientes); «Ver todos» enseña también los que faltan. */
async function fillMedals(root) {
  const box = $('.prof-medals', root);
  let rows = state.achievements;
  if (!rows.length) { try { rows = await getAchievements(); state.achievements = rows; } catch { rows = []; } }
  if (!box.isConnected) return;
  const earned = new Map(rows.map((r) => [r.key, r]));
  const recent = [...rows].sort((a, b) => String(b.earned_at).localeCompare(String(a.earned_at)));
  if (!rows.length) {
    box.innerHTML = html`<p class="muted small">Aún no tienes logros. Escanea tus primeros libros o completa una serie. ✦</p>`;
    return;
  }
  box.innerHTML = recent.map((r) => medalHtml(r.key, { meta: r.meta })).join('');
  const all = $('[data-all-ach]', root);
  all.hidden = false;
  all.textContent = `Ver todos (${rows.length})`;
  all.onclick = () => {
    const keys = [...recent.map((r) => r.key), ...SHOWCASE.filter((k) => !earned.has(k))];
    box.classList.add('all');
    box.innerHTML = keys.map((k) => medalHtml(k, { earned: earned.has(k), meta: earned.get(k)?.meta })).join('');
    all.hidden = true;
  };
}
