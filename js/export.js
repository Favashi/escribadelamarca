// Exportación de los datos del usuario (biblioteca y, si es Mecenas, deseos, préstamos y partidas).
// La descarga completa en JSON es gratuita para todos (derecho de portabilidad del RGPD);
// el CSV de la biblioteca sigue siendo un extra de Mecenas.
import { state, user, bookById, categoryName, barcodesOf, compareBooks, isSupporter } from './store.js';
import { download } from './util.js';
import * as api from './api.js';

const stamp = () => new Date().toISOString().slice(0, 10);

/** Filas de la biblioteca, ordenadas por categoría y serie. */
export function libraryRows() {
  return [...state.library.values()]
    .map((e) => ({ e, b: bookById(e.catalog_id) ?? { title: '' } }))
    .sort((x, y) => categoryName(x.b.category_id).localeCompare(categoryName(y.b.category_id), 'es') || compareBooks(x.b, y.b))
    .map(({ e, b }) => ({
      codigo: b.code ?? '', titulo: b.title, categoria: categoryName(b.category_id), autor: b.author ?? '',
      codigos_barras: barcodesOf(b.id).filter((c) => c.status === 'approved').map((c) => c.code).join(' '),
      registrado: e.added_at, estado: e.condition ?? '', notas: e.notes ?? '', repetidos: e.spares ?? 0,
    }));
}

export function downloadLibraryCsv() {
  const data = libraryRows();
  const cols = Object.keys(data[0] ?? { titulo: '' });
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + [cols.join(';'), ...data.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n');
  download(`biblioteca-marca-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
}

/** Todos tus datos en un JSON: perfil, biblioteca, lista de deseos, sugerencias y, si eres Mecenas, préstamos y partidas. */
export async function downloadAllJson() {
  const uid = user().id;
  const title = (id) => bookById(id)?.title ?? id;
  const data = {
    exportado: new Date().toISOString(),
    cuenta: { email: user().email, nombre: state.profile?.display_name ?? null, mecenas: isSupporter() },
    biblioteca: libraryRows(),
    logros: state.achievements.map((a) => ({ logro: a.key, nivel: a.level, conseguido: a.earned_at, detalle: a.meta })),
    sugerencias: state.suggestions.filter((s) => s.created_by === uid)
      .map((s) => ({ libro: title(s.catalog_id), cambios: s.changes, nota: s.note, estado: s.status, fecha: s.created_at })),
    lista_de_deseos: [...state.wishlist].map(title),
  };
  if (isSupporter()) {
    const [loans, plays] = await Promise.all([api.getLoans(uid).catch(() => []), api.getPlays(uid).catch(() => [])]);
    data.prestamos = loans.map((l) => ({ libro: title(l.catalog_id), a: l.lent_to, desde: l.lent_at, devuelto: l.returned_at }));
    data.diario_de_partidas = plays.map((p) => ({ libro: title(p.catalog_id), rol: p.role, fecha: p.played_on, grupo: p.group_name, notas: p.notes }));
  }
  download(`escriba-de-la-marca-mis-datos-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
}
