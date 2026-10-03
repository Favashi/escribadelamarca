// Versión de la app y novedades. Única fuente de verdad:
// - la app muestra las notas al actualizarse y en Perfil → «Novedades»;
// - el workflow de Pages crea la etiqueta y la GitHub Release cuando cambia APP_VERSION.
// Al publicar: sube APP_VERSION (semver) y añade una entrada ARRIBA en RELEASES.

export const APP_VERSION = '1.15.0';

export const RELEASES = [
  {
    version: '1.15.0',
    date: '2026-10-03',
    notes: ['Mejoras internas de administración.'],
  },
  {
    version: '1.14.2',
    date: '2026-10-03',
    notes: ['Orden de los módulos corregido: las reediciones como B10* aparecen junto a su original, y La Marca Estelar (B1-LME) al final de la serie.'],
  },
  {
    version: '1.14.1',
    date: '2026-09-30',
    notes: ['Si un código de barras aparece en varios libros, primero salen los que aún no tienes, y la app te recuerda que puedes escribir el código de la portada (B5, G1…) para ir directo al libro.'],
  },
  {
    version: '1.14.0',
    date: '2026-09-29',
    notes: [
      'Elige tu nombre público en el Perfil: es el que se ve en la Comunidad y en tu lista de deseos compartida.',
      'La misión de códigos de barras enseña qué libros son, y puedes avisar si un libro no tiene código impreso.',
      'En «Sugerir cambios» ya puedes indicar la fecha de publicación y el formato, si la duración es variable o si no es una aventura jugable.',
      'Si un código de barras aparece en varios libros, la app explica por qué y te deja elegir el tuyo.',
    ],
  },
  {
    version: '1.13.1',
    date: '2026-09-28',
    notes: ['Corregido: en las misiones ya no aparece «()» cuando un libro no tiene código de publicación.'],
  },
  {
    version: '1.13.0',
    date: '2026-09-28',
    notes: [
      'Nueva pestaña «Aportaciones»: misiones para ayudar a completar el catálogo (datos de juego, resúmenes, códigos de barras…) y todo lo que has propuesto, con su estado. Lo pendiente lo puedes retirar.',
      'Las aportaciones dan experiencia según el esfuerzo: 100 PX un código o una corrección, 150 los datos de juego, 200 un resumen y 250 un libro nuevo.',
      'Te avisamos en la pestaña cuando revisan una de tus propuestas.',
    ],
  },
  {
    version: '1.12.1',
    date: '2026-09-27',
    notes: [
      'La app se actualiza sola al volver a ella: ya no hace falta cerrarla para ver los libros nuevos del catálogo.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-09-27',
    notes: [
      'Descatalogados: las publicaciones que ya no se pueden comprar nuevas llevan la etiqueta «Descatalogado» (en la ficha, el catálogo, tu biblioteca y la lista de deseos). Así sabes cuáles tendrás que buscar de segunda mano.',
      'En «Mi biblioteca» → Filtros → Mostrar, elige «Descatalogados» con «Ver los que me faltan» para ver cuáles te faltan y ya no se venden.',
      '¿Sabes que un libro está descatalogado? Indícalo desde «Sugerir cambios» en su ficha.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-09-27',
    notes: [
      'Libros con el código de barras mal impreso (el último dígito no cuadra): si escribes el código a mano, la app los encuentra igualmente. Si no lo conoce, te sugiere buscar por el código de publicación (MP, B1…) o por el título.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-09-27',
    notes: [
      'Niveles de escriba: ganas experiencia (PX) con cada aportación aceptada al catálogo, cada logro y cada partida jugada o dirigida. Tu nivel sale arriba a la derecha; tócalo para ver tu progreso.',
      'Elige tu emblema: 30 iconos de fantasía (dragón, búho, dado de veinte, calavera…). Los Mecenas lo llevan con un marco de moneda antigua.',
      'Nueva página Comunidad, con los Escribas que más aportan y los Mecenas que sostienen la app. Aparecer es voluntario y se activa en tu perfil.',
    ],
  },
  {
    version: '1.10.4',
    date: '2026-09-27',
    notes: [
      'Al proponer un libro, la app te avisa si ya hay uno con el mismo código, el mismo código de barras o un título parecido, y puedes ir directamente a él.',
      'Las etiquetas se eligen de entre las que ya se usan en el catálogo (con buscador), o se crea una nueva.',
      'En tu perfil, Logros, Apariencia y Acerca de se pueden plegar, y la app recuerda cómo los dejaste.',
      'Corregido: al editar un libro, lo que escribías nada más abrir el formulario podía acabar en el título.',
    ],
  },
  {
    version: '1.10.3',
    date: '2026-09-25',
    notes: [
      '«Mi biblioteca» más despejada: el orden y los filtros se agrupan en el botón «Filtros», que indica cuántos tienes activos.',
      'En el buscador de aventuras, la duración, las etiquetas y el resto de opciones pasan a «Más filtros»; nivel y jugadores siguen a la vista.',
    ],
  },
  {
    version: '1.10.2',
    date: '2026-09-25',
    notes: ['Mejoras internas.'],
  },
  {
    version: '1.10.1',
    date: '2026-09-25',
    notes: ['Mejoras internas.'],
  },
  {
    version: '1.10.0',
    date: '2026-09-25',
    notes: [
      'Nuevo: marca cualquier libro como Leído, Jugado o Dirigido desde su ficha, lo tengas o no.',
      'Las marcas se ven como iconos en la biblioteca y el catálogo, y puedes filtrar por ellas en «Mi biblioteca» (Sin leer, Jugados…).',
      'El buscador de aventuras permite a todos ocultar las que ya has jugado o dirigido.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-09-24',
    notes: [
      '¡Portadas! Gracias al permiso de La Marca del Este, los libros empiezan a mostrar su portada real. Se irán añadiendo poco a poco.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-09-24',
    notes: [
      'La lista de deseos ya es para todos: pulsa «☆ Lo quiero» en un libro que te falte y compártela con un enlace desde Perfil → Lista de deseos.',
      'Al compartir el enlace de la app en WhatsApp, Telegram o Discord ahora se ve una vista previa con imagen.',
      'Política de privacidad actualizada: recuento anónimo de visitas a la portada y, si llegas por un enlace de difusión, de qué canal vienes.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-24',
    notes: [
      'Nuevo en Catálogo: «Nuevos en el catálogo», con las publicaciones recién llegadas y las que están a punto de salir, para añadirlas con un toque.',
    ],
  },
  {
    version: '1.6.5',
    date: '2026-09-24',
    notes: ['Mejoras internas para mantener el catálogo al día desde la propia app.'],
  },
  {
    version: '1.6.4',
    date: '2026-09-24',
    notes: ['Los datos técnicos de los errores de la app se guardan ahora 30 días (antes 90).'],
  },
  {
    version: '1.6.3',
    date: '2026-09-24',
    notes: [
      'Si algo falla en la app, me llega un aviso para arreglarlo cuanto antes. Solo se guarda información técnica del error (nada de lo que tienes o buscas); detalles en la política de privacidad.',
      'Mejoras internas de vigilancia: aviso inmediato si la app deja de estar disponible.',
    ],
  },
  {
    version: '1.6.2',
    date: '2026-09-24',
    notes: [
      'La portada tiene un botón flotante para invitarme a un café. Política de privacidad actualizada: ese botón se carga desde Buy Me a Coffee (solo en la portada, no dentro de la app).',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-09-24',
    notes: [
      'Accesibilidad: los lectores de pantalla indican bien si una casilla del modo marcar, del catálogo o una etiqueta del buscador está activada.',
      'Mejoras internas: pruebas automáticas de seguridad y del uso principal de la app.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-24',
    notes: [
      'Nueva página de Ayuda con las preguntas frecuentes: escanear, series, logros, Mecenas, privacidad… Está en Perfil → Acerca de y en la bienvenida.',
      'Ordena tu biblioteca por serie y número, por lo último que has añadido o por título.',
      '¿No sabes qué preparar? En «Aventuras», el botón «Sorpréndeme» elige una al azar entre las que cumplen tus filtros.',
      'Tamaño de letra: agrándala (o redúcela) en Perfil → Apariencia.',
      'Página de Escribas: un agradecimiento a quienes más ayudan con el catálogo. Es voluntaria: actívala en Perfil → Rango de escriba.',
      'Iconos propios en toda la app, en lugar de emojis.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-24',
    notes: [
      'Da de alta tu colección de golpe: en «Mi biblioteca → Por series», pulsa «Marcar los libros que tengo» y toca las casillas (o marca una serie entera).',
      'Quitar un libro ya no pide confirmación: aparece «Deshacer» durante unos segundos y lo recuperas con su fecha y sus notas.',
      'Nuevo «Enviar comentario» en Perfil: cuéntame fallos o ideas directamente desde la app mientras está en pruebas.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-24',
    notes: [
      'Logros: celebra cuando completas una serie o llegas a 10, 25, 50 o 100 libros. Están en tu perfil y no se pierden nunca.',
      'Rangos de escriba: de Aprendiz a Gran Escriba de la Marca según tus aportaciones aceptadas al catálogo (códigos, correcciones y libros).',
      'Series que crecen: los módulos recién publicados se marcan como «Nuevo», cada serie indica si la tienes «Al día» y la biblioteca te avisa de las novedades en las series que coleccionas.',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-09-24',
    notes: ['Mejoras internas para mantener el catálogo al día.'],
  },
  {
    version: '1.3.1',
    date: '2026-09-24',
    notes: ['Mejoras internas.'],
  },
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
