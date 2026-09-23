// Versión de la app y novedades. Única fuente de verdad:
// - la app muestra las notas al actualizarse y en Perfil → «Novedades»;
// - el workflow de Pages crea la etiqueta y la GitHub Release cuando cambia APP_VERSION.
// Al publicar: sube APP_VERSION (semver) y añade una entrada ARRIBA en RELEASES.

export const APP_VERSION = '1.1.0';

export const RELEASES = [
  {
    version: '1.1.0',
    date: '2026-09-24',
    notes: [
      'Nuevo buscador de aventuras (pestaña «Aventuras»): filtra por nivel del grupo, número de jugadores, duración y tipo de aventura, y combínalo con lo que tienes o te falta.',
      'Las fichas muestran niveles, jugadores, sesiones, etiquetas y resumen de más de 60 módulos, gracias al Codex LMDE.',
      'Mecenas: diario de partidas para apuntar qué has dirigido o jugado, cuándo y con qué grupo.',
      'Mecenas: lista de deseos compartible con un enlace, repetidos e intercambio entre Mecenas, y valor de la colección.',
      'Hazte Mecenas con un café (5 €).',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-09-24',
    notes: [
      'Tema Pergamino renovado (Mecenas): papel envejecido con textura, tinta sepia, títulos en letra uncial y marcos de doble filete.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-09-24',
    notes: [
      'Nuevo icono: un sello de lacre con la «E» del Escriba.',
      'Retoques en la portada: el sello preside el título y el código E1 queda junto a la franja.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-09-24',
    notes: [
      'Nueva portada inspirada en los módulos de la Marca, con su franja diagonal.',
      'Colores renovados: morado de módulo, rojo de la Caja Roja y dorado, en tema claro y oscuro.',
      'Las portadas generadas ahora parecen mini-portadas moradas con las iniciales en dorado.',
      'Enlace a OSR Manager, la ayuda de mesa para directores de juego.',
    ],
  },
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
