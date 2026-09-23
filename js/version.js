// Versión de la app y novedades. Única fuente de verdad:
// - la app muestra las notas al actualizarse y en Perfil → «Novedades»;
// - el workflow de Pages crea la etiqueta y la GitHub Release cuando cambia APP_VERSION.
// Al publicar: sube APP_VERSION (semver) y añade una entrada ARRIBA en RELEASES.

export const APP_VERSION = '1.3.0';

export const RELEASES = [
  {
    version: '1.3.0',
    date: '2026-09-24',
    notes: [
      'Nuevo: «✎ Sugerir cambios» en cada ficha. ¿Falta el autor, los niveles o hay una errata? Propón la corrección y, cuando se revise, la verán todos.',
      'Bienvenida para quien empieza: tres pasos para sacar partido a la app desde el primer día (y puedes volver a verla desde Perfil).',
      'Ahora cualquiera puede descargar una copia de todos sus datos desde Perfil → Zona de peligro.',
      'Las opciones de vaciar la biblioteca y eliminar la cuenta se agrupan en una «Zona de peligro» plegada, y eliminar la cuenta pide escribir ELIMINAR.',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-09-24',
    notes: [
      'Las tipografías se cargan desde la propia app: más rápido y sin enviar datos a Google.',
      'Mejoras internas de mantenimiento.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-09-24',
    notes: [
      'En la ficha de un libro, desliza a izquierda o derecha (o usa las flechas de arriba) para pasar al anterior o al siguiente de la lista de la que vienes.',
      'Perfil: nuevo apartado «Acerca de» con botones para ver las novedades y buscar actualizaciones.',
      'Arreglado el campo de fecha del diario de partidas, que se salía de la pantalla en iPhone.',
      'Los extras de Mecenas llevan un ribete dorado en la esquina, y si eres Mecenas la pestaña Perfil se ve en dorado con una estrella.',
      'Nuevo tema Retro EGA para Mecenas, con aire de terminal de los 80 (como OSR Manager).',
      'Los Mecenas tienen en Perfil accesos directos a cada extra, y la pantalla de Mecenas un índice para saltar a cada sección.',
      '«Cerrar sesión» pasa a la tarjeta de tu perfil, lejos de las opciones de borrar datos.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-24',
    notes: [
      'La app avisa cuando hay una versión nueva y se actualiza con un toque, también instalada en el móvil (iPhone incluido).',
      'Perfil → «Buscar actualizaciones» para comprobarlo cuando quieras.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-24',
    notes: [
      'Nueva vista «Por series» en tu biblioteca: cada serie (B, X, C, G…) con sus huecos a la vista y la lista de lo que te falta, por ejemplo «Te faltan: B7, B13».',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-09-24',
    notes: [
      'Ya puedes eliminar tu cuenta y todos tus datos desde Perfil → «Eliminar mi cuenta».',
      'Política de privacidad ampliada: responsable y contacto, bases legales, proveedores, plazos y tus derechos.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-09-24',
    notes: [
      'Política de privacidad actualizada: estadísticas de uso agregadas (sin guardar qué escaneas ni qué buscas) para mejorar la app.',
      'Mejoras internas.',
    ],
  },
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
