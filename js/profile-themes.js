// Temas del perfil público: gratis, de logros (se desbloquean coleccionando), de serie (al completar una serie) y de
// Mecenas. La misma regla está en el servidor (public.profile_theme_allowed): si no está ganado, se enseña «oro».
// Los colores de un tema de serie salen de su primera portada (canvas); el admin puede fijarlos en Admin → Ajustes.
import { state, isSupporter } from './store.js';
import { seriesMap, xpBreakdown, RANKS } from './achievements.js';
import { settings } from './settings.js';

export const FIXED_THEMES = [
  { id: 'oro', name: 'Oro y púrpura', group: 'free', sw: ['#f3c02f', '#e2451d', 'radial-gradient(#5e2c72,#1a0d20)'] },
  { id: 'bosque', name: 'Bosque de Valion', group: 'free', sw: ['#9be15d', '#2f7d32', 'linear-gradient(#183a20,#07100a)'] },
  { id: 'cartografo', name: 'Cartógrafo', group: 'ach', ach: 'explorer', sw: ['#ecd29a', '#9a6a2c', 'linear-gradient(#4a3418,#140d06)'] },
  { id: 'biblioteca', name: 'Gran Biblioteca', group: 'ach', ach: 'books:50', sw: ['#e8b765', '#7a4a1f', 'linear-gradient(#3a2414,#140b06)'] },
  { id: 'dragones', name: 'Señor de Dragones', group: 'ach', ach: 'rank:3', sw: ['#ff9a3d', '#8c1d0f', 'radial-gradient(#3a0d0d,#0a0303)'] },
  { id: 'caja', name: 'Caja Roja', group: 'supporter', sw: ['#f4c75b', '#c4161c', 'linear-gradient(#a5121a,#4a0508)'] },
  { id: 'sangre', name: 'Sangre de dragón', group: 'supporter', sw: ['#ff6b4a', '#9b1c14', 'linear-gradient(#4a1418,#120607)'] },
  { id: 'arcano', name: 'Arcano', group: 'supporter', sw: ['#7fd6ff', '#5b3bd6', 'linear-gradient(#232a63,#080a18)'] },
  { id: 'escarcha', name: 'Escarcha del Norte', group: 'supporter', sw: ['#d6f1ff', '#2b6c9e', 'linear-gradient(#24425a,#071019)'] },
];

const seriesCode = (id) => (String(id ?? '').startsWith('serie:') ? id.slice(6) : null);
const seriesName = (code) => settings.series_palettes?.[code]?.name || `Serie ${code}`;

/** Nombre de un tema («serie:XR» → el nombre que haya puesto el admin o «Serie XR»). */
export function themeName(id) {
  const code = seriesCode(id);
  if (code) return seriesName(code);
  return FIXED_THEMES.find((t) => t.id === id)?.name ?? 'Oro y púrpura';
}

const has = (key) => state.achievements.some((a) => a.key === key);
const missingText = (codes) => (codes.length <= 3 ? `te faltan ${codes.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : `te faltan ${codes.length}`);

/** Progreso de un tema de logro: { ok, text, pct }. */
function achProgress(t) {
  if (t.ach === 'explorer') {
    const cats = new Set(state.catalog.filter((b) => b.status === 'approved').map((b) => b.category_id).filter(Boolean));
    const mine = new Set(state.catalog.filter((b) => state.library.has(b.id)).map((b) => b.category_id));
    const n = [...cats].filter((c) => mine.has(c)).length;
    return { ok: has('explorer'), done: 'Explorador de la Frontera', text: `Ten un libro de cada categoría · ${n} de ${cats.size}`, pct: cats.size ? (n / cats.size) * 100 : 0 };
  }
  if (t.ach === 'books:50') {
    const n = state.library.size;
    return { ok: has('books:50'), done: '50 libros en tu biblioteca', text: `Llega a 50 libros · te faltan ${Math.max(0, 50 - n)}`, pct: Math.min(100, (n / 50) * 100) };
  }
  if (t.ach === 'rank:3') {
    const xp = xpBreakdown().total;
    return { ok: has('rank:3'), done: `Rango ${RANKS[3].name}`, text: `Alcanza el rango ${RANKS[3].name} · ${xp.toLocaleString('es-ES')} / ${RANKS[3].min.toLocaleString('es-ES')} PX`, pct: Math.min(100, (xp / RANKS[3].min) * 100) };
  }
  return { ok: false, text: '', pct: 0 };
}

/**
 * Temas para el selector de Ajustes, por grupos: [{ group, label, items: [{ id, name, ok, sub, pct, sw, cover }] }].
 * De serie: las completadas y, bloqueadas, las 3 más cerca de completarse (de las que tienes algo).
 */
export function themeOptions() {
  const supporter = isSupporter();
  const item = (t, extra) => ({ id: t.id, name: t.name, sw: t.sw, ...extra });
  const free = FIXED_THEMES.filter((t) => t.group === 'free').map((t) => item(t, { ok: true, sub: 'Siempre disponible' }));
  const ach = FIXED_THEMES.filter((t) => t.group === 'ach').map((t) => {
    const p = achProgress(t);
    return item(t, { ok: p.ok, sub: p.ok ? `✓ ${p.done}` : p.text, pct: p.ok ? null : p.pct });
  });
  const series = [];
  for (const [code, books] of seriesMap()) {
    const owned = books.filter((b) => state.library.has(b.id));
    if (!owned.length) continue;
    const missing = books.filter((b) => !state.library.has(b.id))
      .sort((x, y) => (x.number ?? 999) - (y.number ?? 999) || String(x.code).localeCompare(String(y.code), 'es', { numeric: true }))
      .map((b) => b.code || '?');
    const cover = books.find((b) => b.cover_url)?.cover_url ?? null;
    series.push({ id: `serie:${code}`, name: seriesName(code), cover, code, ok: has(`series:${code}`) || !missing.length,
      sub: !missing.length ? `✓ Serie ${code} completa` : `Completa la serie ${code} · ${missingText(missing)}`,
      pct: missing.length ? (owned.length / books.length) * 100 : null });
  }
  const done = series.filter((s) => s.ok);
  const close = series.filter((s) => !s.ok).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const unlocked = [...ach, ...done].filter((i) => i.ok).length;
  return [
    { group: 'free', label: 'Gratis', items: free },
    { group: 'ach', label: 'Por logros', count: `${unlocked} de ${ach.length + done.length + close.length}`, items: [...ach, ...done, ...close] },
    { group: 'supporter', label: '★ Mecenas', items: FIXED_THEMES.filter((t) => t.group === 'supporter')
      .map((t) => item(t, { ok: supporter, supporterOnly: true, sub: t.id === 'caja' ? 'Exclusivo · guiños a los módulos' : 'Mecenas' })) },
  ];
}

// ---------- Paleta de los temas de serie ----------
const DEFAULT_PALETTE = { acc: '#f3c02f', acc2: '#7a4a1f', bg: '#0d0906' };
const cache = new Map();

/** HSL → «#rrggbb» (para que el admin pueda retocarlo con un selector de color). */
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Dos tonos dominantes (los más saturados) de una portada: el más vivo para el acento, otro para el fondo. */
function extract(img) {
  const c = document.createElement('canvas');
  c.width = 24; c.height = 36;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 24, 36);
  const { data } = ctx.getImageData(0, 0, 24, 36);
  const bins = new Array(24).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.12 || max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    bins[Math.floor(h / 15)] += d * max;
  }
  const order = bins.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
  if (!order[0][0]) return DEFAULT_PALETTE;
  const h1 = order[0][1] * 15 + 7;
  const second = order.find(([w, i]) => w > 0 && Math.min(Math.abs(i * 15 - h1), 360 - Math.abs(i * 15 - h1)) >= 45);
  const h2 = second ? second[1] * 15 + 7 : (h1 + 160) % 360;
  return { acc: hsl(h1, 75, 72), acc2: hsl(h2, 60, 38), bg: hsl(h2, 45, 4) };
}

/** Paleta de una serie: la del admin (app_settings.series_palettes) o la sacada de su portada. */
export function seriesPalette(code, coverUrl) {
  const fixed = settings.series_palettes?.[code];
  if (fixed?.acc) return Promise.resolve({ ...DEFAULT_PALETTE, ...fixed });
  if (!coverUrl) return Promise.resolve(DEFAULT_PALETTE);
  if (!cache.has(coverUrl)) {
    cache.set(coverUrl, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { try { resolve(extract(img)); } catch { resolve(DEFAULT_PALETTE); } };
      img.onerror = () => resolve(DEFAULT_PALETTE);
      img.src = coverUrl;
    }));
  }
  return cache.get(coverUrl);
}

/** Pone la paleta de serie en un elemento (variables --s-*). */
export function applyPalette(el, pal) {
  el.style.setProperty('--s-acc', pal.acc);
  el.style.setProperty('--s-acc2', pal.acc2);
  el.style.setProperty('--s-bg', pal.bg);
}

export { seriesCode };
