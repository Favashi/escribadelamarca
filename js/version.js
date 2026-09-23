// Versión de la app y novedades. Única fuente de verdad:
// - la app muestra las notas al actualizarse y en Perfil → «Novedades»;
// - el workflow de Pages crea la etiqueta y la GitHub Release cuando cambia APP_VERSION.
// Al publicar: sube APP_VERSION (semver) y añade una entrada ARRIBA en RELEASES.

export const APP_VERSION = '1.0.0';

export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-09-24',
    notes: [
      'Primera versión pública de Escriba de la Marca.',
      'Biblioteca personal con más de 100 publicaciones de la Marca del Este, ordenadas por serie y categoría.',
      'Escáner de códigos de barras continuo: enfoca un libro tras otro sin pulsar nada.',
      'Búsqueda por código de portada (B1, X2, G0…) para los módulos sin código de barras.',
      'Catálogo de la comunidad: propón libros y códigos que falten.',
      'Mecenas: lista de deseos, préstamos, estadísticas, exportación y tema Pergamino.',
      'Opción para vaciar tu biblioteca y empezar de cero.',
    ],
  },
];
