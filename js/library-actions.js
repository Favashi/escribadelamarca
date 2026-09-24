// Acciones sobre la biblioteca que se comparten entre vistas (quitar con «Deshacer», marcar en bloque).
import { state, user, refreshLibrary, bookById } from './store.js';
import { toast } from './util.js';
import { errMsg } from './ui.js';
import * as api from './api.js';

/**
 * Quita un libro de la biblioteca sin pedir confirmación, pero con «Deshacer» durante unos segundos,
 * que lo repone con su fecha de registro, estado, notas y repetidos.
 * `onChange` se llama tras quitar y tras deshacer, para que la vista se vuelva a pintar.
 */
export async function removeWithUndo(bookId, onChange = () => {}) {
  const uid = user().id;
  const entry = { ...state.library.get(bookId), user_id: uid, catalog_id: bookId };
  const title = bookById(bookId)?.title ?? 'Libro';
  await api.removeFromLibrary(uid, bookId);
  await refreshLibrary();
  onChange();
  toast(`«${title}» quitado de tu biblioteca`, 'info', {
    action: {
      label: 'Deshacer',
      onClick: async () => {
        try {
          await api.restoreLibraryEntry(entry);
          await refreshLibrary();
          onChange();
          toast('Recuperado, con su fecha y notas', 'ok');
        } catch (e) { toast(errMsg(e), 'error'); }
      },
    },
  });
}

/** Añade varios libros de una vez (los que ya tuvieras se ignoran). Devuelve cuántos eran nuevos. */
export async function addMany(bookIds) {
  const fresh = bookIds.filter((id) => !state.library.has(id));
  if (!fresh.length) return 0;
  await api.addManyToLibrary(user().id, fresh);
  await refreshLibrary();
  return fresh.length;
}
