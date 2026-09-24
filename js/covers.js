// Portadas (solo admin): se reducen y comprimen en el propio dispositivo y se guardan en el bucket público «covers»
// de Supabase Storage (nunca en el repositorio). catalog.cover_url guarda la URL pública.
// Permiso de La Marca del Este (septiembre de 2026); covers_enabled (Admin → Ajustes) las oculta al momento.
import { supabase } from './supabase.js';
import { state } from './store.js';

const BUCKET = 'covers';
const MAX_W = 400;          // px de ancho (proporción del original); suficiente para la ficha en pantallas retina
const MAX_H = 640;

/** Reduce y comprime una imagen. WebP si el navegador sabe generarlo (Safari antiguo no): si no, JPEG. */
export async function compressCover(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';            // PNG con transparencia → fondo blanco
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const toBlob = (type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.84);
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return blob;
}

/** Ruta dentro del bucket a partir de una URL pública nuestra (o null si la portada está en otro sitio). */
function pathOf(url) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/covers\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Sube la portada de un libro (sustituye la anterior) y devuelve la URL nueva. */
export async function uploadCover(book, file) {
  const blob = await compressCover(file);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  // Nombre nuevo en cada subida: así nadie ve la portada vieja por la caché del navegador
  const path = `${book.id}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type, cacheControl: '31536000', upsert: false,
  });
  if (error) throw error;
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await supabase.from('catalog').update({ cover_url: url }).eq('id', book.id);
  if (e2) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw e2;
  }
  const old = pathOf(book.cover_url);
  if (old) await supabase.storage.from(BUCKET).remove([old]);   // si falla, solo queda un fichero huérfano
  return { url, bytes: blob.size };
}

/** Quita la portada de un libro (y su fichero, si es nuestro). */
export async function removeCover(book) {
  const { error } = await supabase.from('catalog').update({ cover_url: null }).eq('id', book.id);
  if (error) throw error;
  const old = pathOf(book.cover_url);
  if (old) await supabase.storage.from(BUCKET).remove([old]);
}

/**
 * Empareja ficheros con libros por el nombre: «B12.jpg», «b12 - La cripta.webp», «CR.png»…
 * (el código de publicación es lo primero del nombre). Devuelve [{ file, code, books }].
 */
export function matchFiles(files) {
  return [...files].map((file) => {
    const code = (file.name.replace(/\.[^.]+$/, '').match(/^[A-Za-z]+\d*/) || [''])[0].toUpperCase();
    const books = code ? state.catalog.filter((b) => (b.code || '').toUpperCase() === code) : [];
    return { file, code, books };
  });
}

/** Emergencia (si se retira el permiso): borra todos los ficheros del bucket y deja los libros sin portada. */
export async function deleteAllCovers() {
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 100 });
    if (error) throw error;
    const names = (data || []).filter((o) => o.id).map((o) => o.name);   // sin «carpetas»
    if (!names.length) break;
    const { error: e2 } = await supabase.storage.from(BUCKET).remove(names);
    if (e2) throw e2;
    removed += names.length;
  }
  const { error } = await supabase.from('catalog').update({ cover_url: null }).like('cover_url', '%/object/public/covers/%');
  if (error) throw error;
  return removed;
}
