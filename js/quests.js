// Misiones de la pestaña «Aportaciones»: se generan solas a partir del catálogo (lo que falta) y cambian de nombre cada
// semana. Los tipos (qué se busca y a dónde lleva) están aquí; los textos, con valores por defecto, se pueden sustituir
// desde Admin → Ajustes → Misiones (app_settings.quests = { tipo: { titles: [...], text: '...' } }).
// Huecos en los textos: {n} cuántos · {serie} código de serie · {titulo} libro destacado · {codigo} su código.
import { state, barcodesOf, compareBooks } from './store.js';
import { settings } from './settings.js';
import { CONTRIB_XP, GAME_FIELDS } from './achievements.js';

// Categorías con aventuras jugables (las que tienen nivel, jugadores y sesiones)
const ADVENTURE_CATS = new Set(['aventuras-b', 'aventuras', 'historicas']);
const MAX_SERIES = 3;   // misiones de datos de juego a la vez (las series con más huecos)

export const QUEST_TYPES = {
  barcode: {
    label: 'Códigos de barras (tu biblioteca)', kind: 'Tu biblioteca · Códigos de barras', px: CONTRIB_XP.code,
    cta: 'Escanear mis libros', personal: true,
    titles: ['El sello perdido', 'La marca invisible', 'Códigos sin dueño'],
    text: '{n} libros que tienes no tienen código de barras en el catálogo. Escanéalos y quien venga detrás los encontrará al momento.',
  },
  game: {
    label: 'Datos de juego (por serie)', kind: 'Serie {serie} · Datos de juego', px: CONTRIB_XP.game, cta: 'Aceptar la misión',
    titles: ['Los pergaminos en blanco de la serie {serie}', 'El cartógrafo perdido de la serie {serie}',
      'Las fichas mudas de la serie {serie}', 'La biblioteca de la serie {serie} busca un escriba'],
    text: '{n} aventuras esperan a que alguien anote su nivel, sus jugadores y sus sesiones. Empieza por {titulo} ({codigo}).',
  },
  summary: {
    label: 'Resúmenes', kind: 'Resúmenes', px: CONTRIB_XP.summary, cta: 'Escribir la crónica',
    titles: ['La crónica inacabada de {titulo}', 'El bardo sin canción: {titulo}', 'Hojas en blanco: {titulo}'],
    text: 'Esta aventura ({codigo}) no tiene resumen. Dos o tres frases sin destripar la trama bastan.',
  },
  editorial: {
    label: 'Ficha editorial', kind: 'Ficha editorial', px: CONTRIB_XP.fix, cta: 'Completar la ficha',
    titles: ['El archivo incompleto', 'Los registros del escriba', 'Polvo en los anaqueles'],
    text: '{n} publicaciones no tienen fecha, páginas o formato. Empieza por {titulo} ({codigo}).',
  },
};

/** Textos de un tipo: los del admin si los hay, si no los de por defecto. */
export function questTexts(type) {
  const custom = settings.quests?.[type] || {};
  const titles = (custom.titles || []).map((t) => String(t).trim()).filter(Boolean);
  return { titles: titles.length ? titles : QUEST_TYPES[type].titles, text: custom.text?.trim() || QUEST_TYPES[type].text };
}

// Rellena los huecos. Hay libros sin código de publicación: se quitan los «()» y espacios que queden vacíos
const fill = (tpl, v) => tpl.replace(/\{(n|serie|titulo|codigo)\}/g, (_, k) => String(v[k] ?? ''))
  .replace(/\s*\(\s*\)/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// La variante cambia cada semana y es la misma para todos
const week = () => Math.floor(Date.now() / (7 * 864e5));

function make(type, key, vars, extra) {
  const { titles, text } = questTexts(type);
  const t = QUEST_TYPES[type];
  return {
    type, key, personal: !!t.personal, px: t.px, cta: t.cta,
    kind: fill(t.kind, vars), title: fill(titles[(week() + hash(key)) % titles.length], vars), text: fill(text, vars), ...extra,
  };
}

/** Misiones de ahora mismo para el usuario: las personales primero. */
export function currentQuests(uid) {
  const approved = state.catalog.filter((b) => b.status === 'approved');
  const pendingFor = new Set(state.suggestions.filter((s) => s.created_by === uid && s.status === 'pending').map((s) => s.catalog_id));
  const open = (b) => !pendingFor.has(b.id);
  const slug = (b) => state.categories.find((c) => c.id === b.category_id)?.slug;
  const adventures = approved.filter((b) => ADVENTURE_CATS.has(slug(b)));
  const quests = [];

  // Tu biblioteca: libros sin ningún código de barras
  const noCode = approved.filter((b) => state.library.has(b.id) && !barcodesOf(b.id).length);
  if (noCode.length) quests.push(make('barcode', 'barcode', { n: noCode.length }, { href: '#/escanear' }));

  if (settings.suggestions_enabled) {
    // Datos de juego, por serie: las series con más huecos
    const noGame = (b) => !GAME_FIELDS.some((f) => b[f] != null);
    const bySeries = new Map();
    for (const b of adventures) if (b.series) (bySeries.get(b.series) ?? bySeries.set(b.series, []).get(b.series)).push(b);
    [...bySeries.entries()]
      .map(([serie, books]) => ({ serie, books, missing: books.filter((b) => noGame(b) && open(b)).sort(compareBooks) }))
      .filter((g) => g.missing.length)
      .sort((a, z) => z.missing.length - a.missing.length || a.serie.localeCompare(z.serie))
      .slice(0, MAX_SERIES)
      .forEach(({ serie, books, missing }) => {
        const [first] = missing;
        quests.push(make('game', `game:${serie}`, { n: missing.length, serie, titulo: first.title, codigo: first.code ?? '' },
          { book: first.id, done: books.length - books.filter(noGame).length, total: books.length, progressLabel: 'completas entre todos' }));
      });

    // Resúmenes: una aventura destacada (cambia cada semana)
    const noSummary = adventures.filter((b) => !b.summary?.trim() && open(b)).sort(compareBooks);
    if (noSummary.length) {
      const b = noSummary[week() % noSummary.length];
      const withSummary = approved.filter((x) => x.summary?.trim()).length;
      quests.push(make('summary', 'summary', { n: noSummary.length, titulo: b.title, codigo: b.code ?? '' },
        { book: b.id, done: withSummary, total: approved.length, progressLabel: 'publicaciones con resumen' }));
    }

    // Ficha editorial: sin fecha, páginas o formato
    const noEditorial = approved.filter((b) => (!b.catalog_date || !b.pages || !b.binding) && open(b)).sort(compareBooks);
    if (noEditorial.length) {
      const [b] = noEditorial;
      quests.push(make('editorial', 'editorial', { n: noEditorial.length, titulo: b.title, codigo: b.code ?? '' },
        { book: b.id, done: approved.length - noEditorial.length, total: approved.length, progressLabel: 'fichas completas' }));
    }
  }
  return quests;
}
