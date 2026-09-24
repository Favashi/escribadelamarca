// Acceso a Supabase. Todas las funciones lanzan en caso de error.
import { supabase } from './supabase.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

export const getProfile = async (uid) =>
  ok(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle());

export const getCategories = async () =>
  ok(await supabase.from('categories').select('*').order('sort_order'));

export const getCatalog = async () =>
  ok(await supabase.from('catalog').select('*').order('title'));

export const getLibrary = async (uid) =>
  ok(await supabase.from('library').select('*').eq('user_id', uid));

export const getBarcodes = async () =>
  ok(await supabase.from('catalog_barcodes').select('*'));

/** Admin: código aprobado y verificado. Usuario: propuesta pendiente. */
export const addBarcode = async (uid, code, catalogId, { admin }) =>
  ok(await supabase.from('catalog_barcodes').insert({
    code, catalog_id: catalogId, created_by: uid,
    source: admin ? 'admin' : 'usuario', status: admin ? 'approved' : 'pending', verified: !!admin,
  }));

export const updateBarcode = async (code, catalogId, fields) =>
  ok(await supabase.from('catalog_barcodes').update(fields).eq('code', code).eq('catalog_id', catalogId));

export const deleteBarcode = async (code, catalogId) =>
  ok(await supabase.from('catalog_barcodes').delete().eq('code', code).eq('catalog_id', catalogId));

export const addToLibrary = async (uid, catalogId) =>
  ok(await supabase.from('library').insert({ user_id: uid, catalog_id: catalogId }).select().single());

export const removeFromLibrary = async (uid, catalogId) =>
  ok(await supabase.from('library').delete().eq('user_id', uid).eq('catalog_id', catalogId));

export const updateLibraryEntry = async (uid, catalogId, fields) =>
  ok(await supabase.from('library').update(fields).eq('user_id', uid).eq('catalog_id', catalogId));

/** Admin: alta aprobada. Usuario: propuesta pendiente. */
export const createBook = async (uid, book, { admin }) =>
  ok(await supabase.from('catalog')
    .insert({ ...book, status: admin ? 'approved' : 'pending', created_by: uid })
    .select().single());

export const updateBook = async (id, fields) =>
  ok(await supabase.from('catalog').update(fields).eq('id', id).select().single());

export const deleteBook = async (id) =>
  ok(await supabase.from('catalog').delete().eq('id', id));

/** Admin: nombres de todos los usuarios (RLS solo lo permite a admins). */
export const getPeople = async () =>
  ok(await supabase.from('profiles').select('id, display_name'));

/** Vacía la biblioteca del usuario (y sus préstamos y lista de deseos). */
export async function resetLibrary(uid) {
  ok(await supabase.from('loans').delete().eq('user_id', uid));
  ok(await supabase.from('wishlist').delete().eq('user_id', uid));
  ok(await supabase.from('library').delete().eq('user_id', uid));
}

/** Borra la cuenta del usuario y, en cascada, todos sus datos. */
export const deleteMyAccount = async () => ok(await supabase.rpc('delete_my_account'));

export const updateProfile = async (uid, fields) =>
  ok(await supabase.from('profiles').update(fields).eq('id', uid));

// --- Mecenas ---
export const getWishlist = async (uid) =>
  ok(await supabase.from('wishlist').select('*').eq('user_id', uid));

export const addWish = async (uid, catalogId) =>
  ok(await supabase.from('wishlist').insert({ user_id: uid, catalog_id: catalogId }));

export const removeWish = async (uid, catalogId) =>
  ok(await supabase.from('wishlist').delete().eq('user_id', uid).eq('catalog_id', catalogId));

export const getLoans = async (uid) =>
  ok(await supabase.from('loans').select('*').eq('user_id', uid).order('lent_at', { ascending: false }));

export const addLoan = async (uid, catalogId, lentTo) =>
  ok(await supabase.from('loans').insert({ user_id: uid, catalog_id: catalogId, lent_to: lentTo }));

export const returnLoan = async (id) =>
  ok(await supabase.from('loans').update({ returned_at: new Date().toISOString() }).eq('id', id));

// --- Diario de partidas (Mecenas) ---
export const getPlays = async (uid) =>
  ok(await supabase.from('plays').select('*').eq('user_id', uid).order('played_on', { ascending: false }));

export const addPlay = async (uid, catalogId, fields) =>
  ok(await supabase.from('plays').insert({ user_id: uid, catalog_id: catalogId, ...fields }));

export const deletePlay = async (id) =>
  ok(await supabase.from('plays').delete().eq('id', id));

// --- Lista de deseos pública e intercambio ---
export const publicWishlist = async (token) =>
  ok(await supabase.rpc('public_wishlist', { p_token: token }));

export const tradeMatches = async () =>
  ok(await supabase.rpc('trade_matches'));

// --- Administración (las funciones comprueban en la base de datos que el usuario es admin) ---
export const adminMetrics = async () => ok(await supabase.rpc('admin_metrics'));
export const adminUsers = async () => ok(await supabase.rpc('admin_users'));
export const adminDonations = async () => ok(await supabase.rpc('admin_donations'));
export const adminSetSupporter = async (userId, value) =>
  ok(await supabase.rpc('admin_set_supporter', { p_user: userId, p_value: value }));
export const adminMatchDonation = async (donationId, userId) =>
  ok(await supabase.rpc('admin_match_donation', { p_donation: donationId, p_user: userId }));

// --- Sugerencias de cambios e historial del catálogo ---
export const getSuggestions = async () =>
  ok(await supabase.from('catalog_suggestions').select('*').order('created_at', { ascending: false }));

export const createSuggestion = async (catalogId, changes, note) =>
  ok(await supabase.from('catalog_suggestions').insert({ catalog_id: catalogId, changes, note: note || null }));

export const deleteSuggestion = async (id) =>
  ok(await supabase.from('catalog_suggestions').delete().eq('id', id));

export const adminApplySuggestion = async (id, changes = null) =>
  ok(await supabase.rpc('admin_apply_suggestion', { p_id: id, p_changes: changes }));

export const adminRejectSuggestion = async (id, note = null) =>
  ok(await supabase.rpc('admin_reject_suggestion', { p_id: id, p_note: note }));

export const getHistory = async (catalogId) =>
  ok(await supabase.from('catalog_history').select('*').eq('catalog_id', catalogId)
    .order('created_at', { ascending: false }).limit(50));

export const adminRestoreVersion = async (historyId) =>
  ok(await supabase.rpc('admin_restore_version', { p_history: historyId }));

// --- Logros ---
export const getAchievements = async () =>
  ok(await supabase.from('user_achievements').select('*'));

export const saveAchievement = async (row) =>
  ok(await supabase.from('user_achievements').upsert(row));

// --- Biblioteca en bloque y deshacer ---
export const addManyToLibrary = async (uid, catalogIds) =>
  ok(await supabase.from('library').upsert(catalogIds.map((id) => ({ user_id: uid, catalog_id: id })),
    { onConflict: 'user_id,catalog_id', ignoreDuplicates: true }));

/** Vuelve a poner una entrada quitada, con su fecha de registro, estado, notas y repetidos originales. */
export const restoreLibraryEntry = async (entry) =>
  ok(await supabase.from('library').upsert({
    user_id: entry.user_id, catalog_id: entry.catalog_id, added_at: entry.added_at,
    condition: entry.condition ?? null, notes: entry.notes ?? null, spares: entry.spares ?? 0,
  }));

// --- Comentarios ---
export const sendFeedback = async (fields) =>
  ok(await supabase.from('feedback').insert(fields));

export const getFeedback = async () =>
  ok(await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200));

export const setFeedbackStatus = async (id, status) =>
  ok(await supabase.from('feedback').update({ status }).eq('id', id));

export const deleteFeedback = async (id) =>
  ok(await supabase.from('feedback').delete().eq('id', id));
