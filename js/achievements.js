// Gamificación ligera: rangos de escriba (aportaciones aceptadas), logros de colección y celebraciones.
// Los logros se calculan aquí y se guardan en user_achievements para que sean permanentes.
import { state, user } from './store.js';
import * as api from './api.js';
import { celebrateDialog } from './ui.js';
import { toast } from './util.js';

// ---------- Nivel y rango de escriba ----------
// PX (puntos de experiencia): por aportación aceptada según el esfuerzo (CONTRIB_XP), 25 por logro (sin contar los de
// rango, que dependen de los propios PX) y 10 por cada libro marcado como jugado o dirigido. Tener libros no da PX.
// Misma fórmula en la base de datos: public.user_xp() y public.suggestion_xp() (migración 20260928000000).
export const XP = { achievement: 25, mark: 10 };
export const CONTRIB_XP = { code: 100, fix: 100, game: 150, summary: 200, book: 250 };
export const GAME_FIELDS = ['min_level', 'max_level', 'min_players', 'max_players', 'sessions'];

/** PX de una corrección aceptada: cuenta la parte de mayor valor (no se suman). */
export function suggestionXp(changes = {}) {
  if ('summary' in changes) return CONTRIB_XP.summary;
  if (GAME_FIELDS.some((f) => f in changes)) return CONTRIB_XP.game;
  return CONTRIB_XP.fix;
}

// El título depende de los PX; los umbrales son los antiguos (por aportaciones) × 100, así nadie baja de rango.
export const RANKS = [
  { min: 0, name: 'Aprendiz de escriba' },
  { min: 100, name: 'Copista' },
  { min: 500, name: 'Cronista' },
  { min: 1500, name: 'Archivero' },
  { min: 4000, name: 'Gran Escriba de la Marca' },
];

/** Aportaciones aceptadas del usuario: sugerencias validadas, códigos aprobados y libros propuestos aprobados. */
export function contributions(uid = user()?.id) {
  const suggestions = state.suggestions.filter((s) => s.created_by === uid && s.status === 'approved').length;
  const codes = state.barcodes.filter((b) => b.created_by === uid && b.status === 'approved' && b.source === 'usuario').length;
  const books = state.catalog.filter((b) => b.created_by === uid && b.status === 'approved' && b.source === 'app').length;
  return { suggestions, codes, books, total: suggestions + codes + books };
}

/** PX del usuario actual, con el desglose. */
export function xpBreakdown(uid = user()?.id) {
  const c = contributions(uid);
  const contributionXp = state.suggestions.filter((s) => s.created_by === uid && s.status === 'approved')
    .reduce((t, s) => t + suggestionXp(s.changes), 0) + c.codes * CONTRIB_XP.code + c.books * CONTRIB_XP.book;
  const achievements = state.achievements.filter((a) => !a.key.startsWith('rank:')).length;
  let marks = 0;
  for (const m of state.marks.values()) marks += (m.played_at ? 1 : 0) + (m.directed_at ? 1 : 0);
  const total = contributionXp + achievements * XP.achievement + marks * XP.mark;
  return { contributions: c, contributionXp, achievements, marks, total };
}

/** PX necesarios para llegar a un nivel: 0, 100, 300, 600, 1000… (cada nivel cuesta 100 PX más que el anterior). */
export const xpForLevel = (level) => 50 * level * (level - 1);
export const levelOf = (xp) => Math.max(1, Math.floor((1 + Math.sqrt(1 + Math.max(0, xp) / 12.5)) / 2));

export function rankOf(xp) {
  let i = 0;
  RANKS.forEach((r, j) => { if (xp >= r.min) i = j; });
  const next = RANKS[i + 1] || null;
  return { index: i, name: RANKS[i].name, next, toNext: next ? next.min - xp : 0 };
}

/** Todo lo que se muestra del nivel: { xp, level, rank, from, to, pct } (from/to: PX del nivel actual y del siguiente). */
export function levelInfo(xp = xpBreakdown().total) {
  const level = levelOf(xp);
  const from = xpForLevel(level), to = xpForLevel(level + 1);
  return { xp, level, rank: rankOf(xp), from, to, pct: Math.round(((xp - from) / (to - from)) * 100) };
}

// ---------- Series y novedades ----------
const NEW_DAYS = 45;
const daysAgo = (d) => (Date.now() - new Date(d).getTime()) / 864e5;

/** ¿Libro recién llegado al catálogo? (fecha de catálogo de Sombra o alta en la app en los últimos 45 días) */
export function isNewBook(b) {
  if (b.status !== 'approved') return false;
  if (b.catalog_date && daysAgo(b.catalog_date) <= NEW_DAYS) return true;
  return b.source === 'app' && b.created_at && daysAgo(b.created_at) <= NEW_DAYS;
}

/** Series con al menos dos publicaciones aprobadas: { code: [libros] } */
export function seriesMap() {
  const map = new Map();
  for (const b of state.catalog) {
    if (b.status !== 'approved' || !b.series) continue;
    (map.get(b.series) ?? map.set(b.series, []).get(b.series)).push(b);
  }
  for (const [k, v] of map) if (v.length < 2) map.delete(k);
  return map;
}

/** Series que coleccionas (tienes al menos uno) con novedades que te faltan. */
export function newInMySeries() {
  const out = [];
  for (const [code, books] of seriesMap()) {
    if (!books.some((b) => state.library.has(b.id))) continue;
    const missingNew = books.filter((b) => isNewBook(b) && !state.library.has(b.id));
    if (missingNew.length) out.push({ code, books: missingNew });
  }
  return out;
}

// ---------- Definición de logros ----------
const MILESTONES = [
  [10, 'Estantería de aventurero'],
  [25, 'Biblioteca de Robleda'],
  [50, 'Archivo de la Marca'],
  [100, 'Gran Biblioteca de Valion'],
];

/** Descripción legible de un logro guardado o calculado. */
export function describe(key, row = {}) {
  const [kind, arg] = key.split(':');
  if (kind === 'first_book') return { icon: 'books', title: 'Primera aventura', text: 'Tu primer libro en la biblioteca.' };
  if (kind === 'books') {
    const m = MILESTONES.find(([n]) => String(n) === arg);
    return { icon: 'books', title: m?.[1] ?? `${arg} libros`, text: `${arg} libros en tu biblioteca.` };
  }
  if (kind === 'explorer') return { icon: 'compass', title: 'Explorador de la Frontera', text: 'Al menos un libro de cada categoría del catálogo.' };
  if (kind === 'series') {
    const n = row.meta?.count;
    return { icon: 'trophy', title: `Serie ${arg} completa`, text: n ? `Completada con ${n} módulos.` : 'Todos los módulos de la serie.' };
  }
  if (kind === 'rank') return { icon: 'quill', title: RANKS[Number(arg)]?.name ?? 'Escriba', text: 'Rango de escriba por tu experiencia en la Marca.' };
  return { icon: 'seal', title: key, text: '' };
}

/** Logros que se cumplen ahora mismo: [{ key, meta }] */
function currentlyEarned() {
  const owned = state.library.size;
  const earned = [];
  if (owned >= 1) earned.push({ key: 'first_book' });
  for (const [n] of MILESTONES) if (owned >= n) earned.push({ key: `books:${n}` });

  const cats = new Set(state.catalog.filter((b) => b.status === 'approved').map((b) => b.category_id).filter(Boolean));
  const mine = new Set(state.catalog.filter((b) => state.library.has(b.id)).map((b) => b.category_id));
  if (cats.size && [...cats].every((c) => mine.has(c))) earned.push({ key: 'explorer' });

  for (const [code, books] of seriesMap()) {
    if (books.every((b) => state.library.has(b.id))) earned.push({ key: `series:${code}`, meta: { count: books.length } });
  }
  const r = rankOf(xpBreakdown().total);
  for (let i = 1; i <= r.index; i++) earned.push({ key: `rank:${i}` });
  return earned;
}

// ---------- Comprobación y celebración ----------

/** Nivel nuevo desde la última vez (0 si no ha subido). La primera vez solo lo apunta. Se guarda por usuario. */
function levelUp() {
  const { level } = levelInfo();
  const key = `edm.level.${user().id}`;
  let prev;
  try { prev = Number(localStorage.getItem(key)) || 0; localStorage.setItem(key, String(Math.max(level, prev))); } catch { return 0; }
  return prev && level > prev ? level : 0;
}
let checking = false;

/** Espera a que no haya ningún diálogo abierto (bienvenida, novedades…) para no pisarlo. */
function dialogFree(maxMs = 120000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => (!document.getElementById('dialog')?.open || Date.now() - t0 > maxMs ? resolve() : setTimeout(tick, 400));
    tick();
  });
}

/**
 * Compara los logros actuales con los guardados, guarda los nuevos y celebra.
 * La primera vez (usuario sin logros guardados) los registra en silencio, para no celebrar de golpe
 * todo lo que ya tenía antes de que existiera la función.
 */
export async function checkAchievements({ celebrate = true } = {}) {
  if (checking || !user()) return;
  checking = true;
  try {
    let stored;
    try { stored = await api.getAchievements(); } catch { return; }   // sin migración aún: no hacer nada
    const byKey = new Map(stored.map((r) => [r.key, r]));
    const firstRun = stored.length === 0;
    const toCelebrate = [];

    for (const e of currentlyEarned()) {
      const prev = byKey.get(e.key);
      const at = new Date().toISOString();
      if (!prev) {
        const meta = e.meta ? { ...e.meta, history: [{ at, count: e.meta.count }] } : {};
        await api.saveAchievement({ key: e.key, level: 1, meta, earned_at: at, updated_at: at });
        toCelebrate.push({ key: e.key, meta, again: false });
      } else if (e.key.startsWith('series:') && (e.meta?.count ?? 0) > (prev.meta?.count ?? 0)) {
        // La serie había crecido y la has vuelto a completar
        const meta = { ...prev.meta, count: e.meta.count, history: [...(prev.meta?.history || []), { at, count: e.meta.count }] };
        await api.saveAchievement({ key: e.key, level: prev.level + 1, meta, earned_at: prev.earned_at, updated_at: at });
        toCelebrate.push({ key: e.key, meta, again: true });
      }
    }
    state.achievements = await api.getAchievements().catch(() => stored);
    document.dispatchEvent(new CustomEvent('edm:xp'));   // distintivo de nivel de la cabecera
    const newLevel = levelUp();

    if (!celebrate || (!toCelebrate.length && !newLevel)) return;
    await dialogFree();
    if (!toCelebrate.length) {
      const { rank } = levelInfo();
      await celebrateDialog({ icon: 'seal', title: `¡Nivel ${newLevel}!`,
        text: `${rank.name}. Sigues sumando experiencia: aportaciones al catálogo, logros y partidas.` });
      return;
    }
    if (firstRun) {
      toast(`Has desbloqueado ${toCelebrate.length} ${toCelebrate.length === 1 ? 'logro' : 'logros'}: míralos en tu perfil ✦`, 'ok');
      return;
    }
    // Una celebración grande (la más importante) y el resto como aviso breve
    const order = (k) => (k.startsWith('series:') ? 0 : k.startsWith('rank:') ? 1 : k.startsWith('books:') ? 2 : 3);
    toCelebrate.sort((a, b) => order(a.key) - order(b.key));
    const [main, ...rest] = toCelebrate;
    const d = describe(main.key, { meta: main.meta });
    const [kind, arg] = main.key.split(':');
    await celebrateDialog({
      icon: d.icon,
      title: kind === 'series' ? (main.again ? `¡Vuelves a tener la serie ${arg} al día!` : `¡Serie ${arg} completa!`)
        : kind === 'rank' ? `Nuevo rango: ${d.title}` : d.title,
      text: kind === 'series' ? `${main.meta.count} módulos. ${main.again ? 'Seguías la serie y ya tienes todas las novedades.' : 'Todos los módulos publicados de la serie.'}`
        : kind === 'rank' ? 'Tu experiencia en la Marca te lleva a un nuevo rango de escriba.' : d.text,
    });
    const extra = [rest.length && `${rest.length} ${rest.length === 1 ? 'logro más' : 'logros más'} en tu perfil`,
      newLevel && `subes a nivel ${newLevel}`].filter(Boolean);
    if (extra.length) toast(`Y ${extra.join(', y ')} ✦`, 'ok');
  } finally {
    checking = false;
  }
}
