// Estado en memoria de la sesión. Datos pequeños: se cargan enteros y se refrescan tras cada cambio.
import * as api from './api.js';

export const state = {
  session: null,
  profile: null,
  categories: [],
  catalog: [],          // libros visibles (aprobados + mis propuestas; admin: todos)
  barcodes: [],         // filas de catalog_barcodes visibles (aprobadas + mis propuestas; admin: todas)
  library: new Map(),   // catalog_id -> fila de library
  wishlist: new Set(),  // catalog_id (solo Mecenas)
  people: new Map(),    // user id -> { display_name } (solo admin)
  suggestions: [],      // sugerencias de cambios: las mías (usuario) o todas (admin)
  achievements: [],     // logros guardados del usuario (user_achievements)
  feedback: [],         // comentarios de usuarios (solo admin)
};

export const user = () => state.session?.user ?? null;
export const isAdmin = () => !!state.profile?.is_admin;
export const isSupporter = () => !!state.profile?.is_supporter;
export const bookById = (id) => state.catalog.find((b) => b.id === id);
export const categoryName = (id) => state.categories.find((c) => c.id === id)?.name ?? 'Sin categoría';

export async function loadAll() {
  const uid = user().id;
  const [profile, categories, catalog, barcodes, library] = await Promise.all([
    api.getProfile(uid), api.getCategories(), api.getCatalog(), api.getBarcodes(), api.getLibrary(uid),
  ]);
  state.barcodes = barcodes;
  state.profile = profile;
  state.categories = categories;
  state.catalog = catalog;
  state.library = new Map(library.map((r) => [r.catalog_id, r]));
  state.wishlist = new Set();
  state.people = new Map();
  try { state.suggestions = await api.getSuggestions(); } catch { state.suggestions = []; }
  if (profile?.is_admin) {
    try { state.feedback = await api.getFeedback(); } catch { state.feedback = []; }
    try { state.people = new Map((await api.getPeople()).map((p) => [p.id, p])); } catch { /* RLS */ }
  }
  if (profile?.is_supporter) {
    try { state.wishlist = new Set((await api.getWishlist(uid)).map((r) => r.catalog_id)); } catch { /* RLS */ }
  }
}

export async function refreshCatalog() {
  [state.catalog, state.barcodes] = await Promise.all([api.getCatalog(), api.getBarcodes()]);
}
export async function refreshLibrary() {
  state.library = new Map((await api.getLibrary(user().id)).map((r) => [r.catalog_id, r]));
  // Cada cambio en la biblioteca puede desbloquear logros (import dinámico: evita dependencia circular)
  import('./achievements.js').then((m) => m.checkAchievements()).catch(() => {});
}

/** Nombre legible de un usuario (solo admin tiene la lista). */
export const personName = (id) => {
  if (!id) return null;
  const p = state.people.get(id);
  return p?.display_name || 'un usuario';
};

/** Número de propuestas pendientes (libros + códigos) para el admin. */
export const pendingCount = () =>
  state.catalog.filter((b) => b.status === 'pending').length
  + state.barcodes.filter((b) => b.status === 'pending').length
  + state.suggestions.filter((s) => s.status === 'pending').length
  + state.feedback.filter((f) => f.status === 'new').length;

export async function refreshSuggestions() {
  try { state.suggestions = await api.getSuggestions(); } catch { /* sin migración aún */ }
}

/** Libros asociados a un código de barras (puede haber varios por errores de las fuentes). */
export const booksForBarcode = (code) =>
  [...new Set(state.barcodes.filter((b) => b.code === code).map((b) => b.catalog_id))].map(bookById).filter(Boolean);

export const barcodesOf = (bookId) => state.barcodes.filter((b) => b.catalog_id === bookId);

/** Libros por código de publicación (B19, G0, CR…). */
export const booksForPubCode = (code) => {
  const c = String(code).trim().toUpperCase();
  return state.catalog.filter((b) => (b.code ?? '').toUpperCase() === c);
};

/** Coincidencia de búsqueda por título, código de publicación o autor. */
export function matches(book, q) {
  if (!q) return true;
  const n = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nq = n(q);
  return n(book.title).includes(nq) || n(book.code).startsWith(nq) || n(book.author).includes(nq);
}

/** Orden natural: serie, número, título (B2 antes que B10). */
export function compareBooks(a, b) {
  return String(a.series ?? '~').localeCompare(String(b.series ?? '~'), 'es')
    || (a.number ?? 1e9) - (b.number ?? 1e9)
    || a.title.localeCompare(b.title, 'es');
}

/** Agrupa libros por categoría respetando sort_order. */
export function groupByCategory(books) {
  const groups = state.categories.map((c) => ({ category: c, books: [] }));
  const other = { category: { id: null, name: 'Sin categoría' }, books: [] };
  for (const b of books) (groups.find((g) => g.category.id === b.category_id) ?? other).books.push(b);
  if (other.books.length) groups.push(other);
  for (const g of groups) g.books.sort(compareBooks);
  return groups;
}
