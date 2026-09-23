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
