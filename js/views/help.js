// Ayuda / preguntas frecuentes. Texto estático; lo de Mecenas solo si las donaciones están activas.
import { html, raw, $, toast } from '../util.js';
import { viewHeader, feedbackDialog, errMsg } from '../ui.js';
import { icon } from '../icons.js';
import { settings } from '../settings.js';
import { SUPPORTER_MIN_AMOUNT } from '../config.js';
import { RANKS } from '../achievements.js';
import { sendFeedback } from '../api.js';
import { APP_VERSION } from '../version.js';

const ISSUES_URL = 'https://github.com/Favashi/escribadelamarca/issues/new';

/** [título de sección, [[pregunta, respuesta HTML], …]] */
function sections() {
  const ranks = RANKS.map((r) => `<strong>${r.name}</strong>${r.min ? ` (${r.min})` : ''}`).join(' → ');
  return [
    ['Empezar', [
      ['¿Cómo instalo la app en el móvil?',
        `<p>No hace falta ninguna tienda de aplicaciones:</p>
        <ul><li><strong>iPhone (Safari):</strong> botón Compartir → <em>Añadir a pantalla de inicio</em>.</li>
        <li><strong>Android (Chrome):</strong> menú ⋮ → <em>Instalar aplicación</em>.</li></ul>
        <p>Se abre a pantalla completa como cualquier otra app y se actualiza sola.</p>`],
      ['Tengo muchos libros, ¿tengo que escanearlos uno a uno?',
        `<p>No. En <a href="#/biblioteca">Mi biblioteca</a> → <em>Por series</em>, pulsa <strong>«Marcar los libros que tengo»</strong>
        y toca las casillas de los que tienes. También puedes marcar una serie entera de golpe.</p>`],
      ['¿Mi colección se ve en el móvil y en el ordenador?',
        '<p>Sí. Se guarda en tu cuenta de Google: entra con la misma cuenta en cualquier dispositivo.</p>'],
    ]],
    ['Escanear', [
      ['El escáner no lee el código',
        `<p>Acerca el libro, busca buena luz (si tu móvil lo permite, enciende la linterna con el botón ${icon('torch')} de la esquina)
        y mantén el código recto dentro del recuadro. Si aun así no lo lee, escribe los números en el campo de debajo.</p>`],
      ['Mi libro no tiene código de barras',
        '<p>Los módulos antiguos se buscan por el <strong>código de portada</strong>: escribe B1, X2, G0… en el campo de debajo del escáner.</p>'],
      ['El código sale como «desconocido»',
        `<p>Ese código aún no está en el catálogo. Elige a qué libro pertenece (o propón el libro si falta) y quedará como
        <strong>propuesta</strong>: cuando se revise, lo reconocerá para todo el mundo. Cada propuesta aceptada te sube de rango.</p>`],
      ['Un código sale en dos libros',
        `<p>Algunas fuentes asignaron el mismo código a publicaciones distintas. La app te deja elegir cuál es; si sabes cuál es el
        correcto, usa <strong>«✎ Sugerir cambios»</strong> en la ficha del libro.</p>`],
      ['¿Qué significa «sin verificar»?',
        `<p>Los códigos del catálogo vienen de un distribuidor y algunos no coinciden con el que lleva impreso el libro.
        «Verificado» quiere decir que alguien lo ha comprobado escaneando un ejemplar real.</p>`],
    ]],
    ['Tu colección', [
      ['¿Qué es la vista «Por series»?',
        `<p>Muestra cada serie (B, X, C, G…) con una casilla por módulo, resaltadas las que tienes,
        con la lista de huecos («Te faltan: B7, B13»).</p>`],
      ['¿Qué quieren decir «Nuevo», «Al día» y «Completa»?',
        `<ul><li><strong>Nuevo</strong>: publicación recién llegada al catálogo (unas semanas). Las tienes todas juntas
        en <a href="#/catalogo">Catálogo</a> → «Nuevos en el catálogo».</li>
        <li><strong>● Al día</strong>: ahora mismo tienes todos los módulos publicados de la serie.</li>
        <li><strong>✦ Completa</strong>: logro permanente. Si la serie crece deja de estar «al día», pero el logro no se pierde,
        y cuando consigas las novedades sube de nivel (×2, ×3…).</li></ul>`],
      ['He quitado un libro sin querer',
        '<p>Justo después de quitarlo aparece <strong>«Deshacer»</strong> unos segundos: lo recupera con su fecha y sus notas.</p>'],
      ['¿Puedo ordenar la biblioteca?',
        '<p>Sí, en la vista «Por categorías»: por serie y número, por los añadidos más recientes o por título.</p>'],
    ]],
    ['Buscar aventuras', [
      ['¿Cómo elijo el próximo módulo para mi grupo?',
        `<p>En <a href="#/buscar">Aventuras</a> indica el nivel del grupo, cuántos jugadores sois y cuánto queréis que dure,
        y filtra por etiquetas. Busca en tu biblioteca o en todo el catálogo. ¿No te decides? Pulsa <strong>«Sorpréndeme»</strong>.</p>`],
      ['Hay módulos sin niveles ni jugadores',
        `<p>Los datos de juego vienen del <a href="https://github.com/diacritica/codexlmde" target="_blank" rel="noopener">Codex LMDE</a>
        y aún faltan algunos. Activa «Incluir libros sin datos de juego» para verlos, y si conoces los datos, sugiérelos desde la ficha.</p>`],
    ]],
    ['Catálogo, logros y rangos', [
      ['¿Cómo corrijo un dato mal?',
        '<p>Abre el libro y pulsa <strong>«✎ Sugerir cambios»</strong>. Se revisa antes de publicarse para que todos lo vean.</p>'],
      ['¿Cómo subo de rango de escriba?',
        `<p>Con aportaciones <em>aceptadas</em> al catálogo: códigos propuestos al escanear, correcciones y libros que faltaban.</p>
        <p class="small">${ranks}</p>`],
      ['¿Qué es la página de Escribas?',
        `<p>Un agradecimiento a quienes más ayudan con el catálogo. <strong>Es voluntaria</strong>: solo aparece quien lo activa en
        Perfil → Rango de escriba. <a href="#/escribas">Ver los Escribas</a>.</p>`],
      ['¿Los logros se pueden perder?',
        '<p>No. Se guardan en tu cuenta con la fecha en que los conseguiste, aunque luego quites libros o la serie crezca.</p>'],
    ]],
    ...(settings.donations_enabled ? [['Mecenas', [
      ['¿Qué es ser Mecenas?',
        `<p>La app es gratuita. Si te resulta útil, puedes invitarme a un café (${SUPPORTER_MIN_AMOUNT} €, pago único) y, como
        agradecimiento, desbloqueas para siempre el diario de partidas, la lista de deseos compartible, repetidos e intercambio,
        préstamos, estadísticas y los temas Pergamino y Retro EGA.</p>`],
      ['He donado y no se ha activado',
        `<p>Se activa sola si pagaste con el mismo email de tu cuenta de Google o lo escribiste en el mensaje. Pulsa
        «Ya he donado» en <a href="#/mecenas">Mecenas</a>; si sigue sin activarse, envíame un comentario y lo reviso.</p>`],
    ]]] : []),
    ['Tus datos y privacidad', [
      ['¿Qué datos guarda la app?',
        `<p>Tu nombre y foto de Google, tu biblioteca y lo que apuntes en ella, y estadísticas de uso agregadas (sin guardar qué
        buscas ni qué escaneas). Detalles en la <a href="privacidad.html">política de privacidad</a>.</p>`],
      ['¿Puedo llevarme mis datos o borrarlos?',
        `<p>Sí. En Perfil → Zona de peligro puedes <strong>descargar todos tus datos</strong> (JSON), vaciar la biblioteca o
        <strong>eliminar la cuenta</strong> con todo lo que contiene.</p>`],
    ]],
    ['La app', [
      ['¿Cómo actualizo la app?',
        '<p>Te avisa sola cuando hay una versión nueva. También puedes comprobarlo en Perfil → Acerca de → «Buscar actualizaciones».</p>'],
      ['La letra me resulta pequeña',
        '<p>Cámbiala en Perfil → Apariencia → <strong>Tamaño de letra</strong>. Ahí también eliges el tema (claro, oscuro…).</p>'],
    ]],
  ];
}

export function renderHelp(root) {
  root.innerHTML = html`
    ${raw(viewHeader('Ayuda', 'Preguntas frecuentes sobre Escriba de la Marca'))}
    ${sections().map(([title, items]) => raw(html`<section class="panel faq">
      <h2>${title}</h2>
      ${items.map(([q, a]) => raw(html`<details class="faq-item">
        <summary>${q}${raw(icon('chevron', { cls: 'faq-chevron' }))}</summary>
        <div class="faq-answer">${raw(a)}</div>
      </details>`))}
    </section>`))}
    <section class="panel faq-contact">
      <h2>¿No encuentras la respuesta?</h2>
      ${settings.feedback_enabled
        ? raw(`<button class="btn btn-primary btn-feedback" data-feedback>${icon('chat')} Pregúntame o cuéntame el fallo</button>`)
        : raw(html`<a class="btn btn-ghost btn-feedback" href="${ISSUES_URL}" target="_blank" rel="noopener">${raw(icon('bug'))} Escríbeme en GitHub</a>`)}
    </section>
    <div class="center pad"><a class="btn btn-ghost btn-sm" href="#/perfil">Volver al perfil</a></div>`;

  $('[data-feedback]', root)?.addEventListener('click', async () => {
    const res = await feedbackDialog();
    if (!res) return;
    try {
      await sendFeedback({ ...res, page: 'ayuda', app_version: APP_VERSION, user_agent: navigator.userAgent.slice(0, 300) });
      toast('¡Gracias! Tu comentario ha llegado', 'ok');
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}
