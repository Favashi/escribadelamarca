// Flujo principal: portada, bienvenida, escanear con la entrada manual, añadir, quitar y deshacer, modo marcar.
// Usa el libro de prueba de supabase/seed.sql (T1, EAN 9780306406157) y el catálogo real de las migraciones (serie B).
import { test, expect, api, useLocalSupabase, newUserSession } from './fixtures.js';

const TEST_EAN = '9780306406157';
const TEST_TITLE = '[Prueba] Aventura de test';

const libraryOf = async (uid) =>
  (await api(`/rest/v1/library?user_id=eq.${uid}&select=catalog_id`)).map((r) => r.catalog_id);
const bookId = async (filter) => (await api(`/rest/v1/catalog?${filter}&select=id`))[0].id;

test('portada sin sesión', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Escriba de la Marca', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar con Google' }).first()).toBeVisible();
  await expect(page.locator('#nav')).toBeHidden();
  // Cifras reales del catálogo (landing_showcase) y ejemplos de la app
  await expect(page.locator('.lp-stats')).toContainText('publicaciones');
  await expect(page.locator('[data-demo-scan]')).toContainText('Ya lo tienes');
  await expect(page.locator('.lp-quest-demo .quest .wax')).toHaveCount(2);
  await page.getByText('¿Es una app oficial?').click();
  await expect(page.getByRole('link', { name: 'de código abierto' })).toHaveAttribute('href', /github\.com\/Favashi\/escribadelamarca/);
});

test.describe('bienvenida', () => {
  test.use({ onboarded: false });

  test('se muestra la primera vez y lleva a la ayuda', async ({ page, account }) => {
    await page.goto('/#/biblioteca');
    const dialog = page.locator('#dialog');
    await expect(dialog.getByRole('heading', { name: 'Escanea tus libros' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Siguiente' }).click();
    await dialog.getByRole('button', { name: 'Siguiente' }).click();
    await dialog.getByRole('button', { name: 'Siguiente' }).click();
    await expect(dialog.getByRole('heading', { name: 'Acepta misiones' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Escanear mi primer libro' })).toBeVisible();
    await dialog.getByRole('button', { name: /Consulta la ayuda/ }).click();
    await expect(page).toHaveURL(/#\/ayuda$/);
    await expect(page.getByRole('heading', { name: 'Ayuda', level: 1 })).toBeVisible();
  });
});

test('escanear con la entrada manual y añadir a la biblioteca', async ({ page, account }) => {
  await page.goto('/#/escanear');
  await page.getByRole('textbox', { name: 'Código de barras o de publicación' }).fill(TEST_EAN);
  await page.getByRole('button', { name: 'Buscar' }).click();

  const result = page.locator('.scan-result');
  await expect(result.getByRole('heading', { name: new RegExp(TEST_TITLE.replace(/[[\]]/g, '\\$&')) })).toBeVisible();
  await result.getByRole('button', { name: 'Añadir' }).click();
  await expect(result.getByText('Ya registrado')).toBeVisible();
  expect(await libraryOf(account.user.id)).toEqual([await bookId('ref=eq.test:T1')]);

  await page.goto('/#/biblioteca');
  await expect(page.getByText('1 libro de', { exact: false })).toBeVisible();
  await expect(page.locator('.card-title', { hasText: TEST_TITLE })).toBeVisible();
});

test('quitar un libro y deshacerlo', async ({ page, account }) => {
  const id = await bookId('ref=eq.test:T1');
  await page.goto(`/#/libro/${id}`);
  await page.getByRole('button', { name: 'Añadir a mi biblioteca' }).click();
  await expect(page.getByRole('button', { name: 'Quitar' })).toBeVisible();

  await page.getByRole('button', { name: 'Quitar' }).click();
  await expect(page.getByRole('button', { name: 'Añadir a mi biblioteca' })).toBeVisible();
  expect(await libraryOf(account.user.id)).toEqual([]);

  await page.locator('.toast').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByText('Recuperado, con su fecha y notas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar' })).toBeVisible();
  expect(await libraryOf(account.user.id)).toEqual([id]);
});

test('modo marcar: añadir desde la vista por series', async ({ page, account }) => {
  await page.goto('/#/biblioteca');
  await page.getByText('Por series', { exact: true }).click();
  await page.getByRole('button', { name: 'Marcar los libros que tengo' }).click();
  await expect(page.getByText('Modo marcar:')).toBeVisible();

  const serieB = page.locator('.series-block', { has: page.getByRole('heading', { name: /^Serie B\b/ }) });
  const b1 = serieB.locator('[data-mark]').filter({ hasText: /^B1$/ });
  await expect(b1).toHaveAttribute('aria-pressed', 'false');
  await b1.click();
  await expect(serieB.locator('[data-mark]').filter({ hasText: /^B1$/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await libraryOf(account.user.id)).toEqual([await bookId('code=eq.B1&status=eq.approved')]);

  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('Modo marcar:')).toBeHidden();
});

test('un error de JavaScript llega a client_errors', async ({ page, account }) => {
  await page.goto('/#/biblioteca');
  await expect(page.getByRole('heading', { name: 'Mi biblioteca' })).toBeVisible();
  await page.evaluate(() => setTimeout(() => { throw new Error('e2e: error de prueba'); }));
  await expect.poll(async () => (await api(
    `/rest/v1/client_errors?user_id=eq.${account.user.id}&select=kind,message,page,app_version`)), { timeout: 10_000 })
    .toEqual([expect.objectContaining({ kind: 'error', message: 'Uncaught Error: e2e: error de prueba', page: '#/biblioteca' })]);
});

test.describe('admin', () => {
  test.use({ admin: true });

  test('edita la ficha editorial de un libro (fecha de publicación y PVP)', async ({ page, account }) => {
    // Libro propio de cada ejecución: escritorio y móvil corren a la vez y no deben pisarse
    const [{ id }] = await api('/rest/v1/catalog?select=id', { method: 'POST',
      body: { title: `[Prueba] ficha editorial ${test.info().project.name}`, status: 'approved', source: 'app' } });
    try {
      await page.goto(`/#/libro/${id}`);
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      const form = page.locator('#dialog form');
      await form.getByLabel('Fecha de publicación').fill('2026-09-01');
      await form.getByLabel('PVP (€)').fill('12,95');
      await form.getByLabel('Formato').fill('Grapado');
      await form.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Libro actualizado')).toBeVisible();
      const [book] = await api(`/rest/v1/catalog?id=eq.${id}&select=catalog_date,price_eur,binding`);
      expect(book).toEqual({ catalog_date: '2026-09-01', price_eur: 12.95, binding: 'Grapado' });
    } finally {
      await api(`/rest/v1/catalog?id=eq.${id}`, { method: 'DELETE' });
    }
  });
});

test('«Nuevos en el catálogo» muestra las publicaciones recientes', async ({ page, account }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [book] = await api('/rest/v1/catalog?select=id', {
    method: 'POST',
    body: { title: '[Prueba] Novedad e2e', code: 'ZZ1', status: 'approved', source: 'app', catalog_date: today },
  });
  try {
    await page.goto('/#/catalogo');
    const news = page.locator('.new-group');
    await expect(news.locator('summary')).toContainText('Nuevos en el catálogo');
    const row = news.locator('.row', { hasText: '[Prueba] Novedad e2e' });
    await expect(row).toContainText('Publicado el');
    await row.getByRole('button', { name: 'Añadir a mi biblioteca' }).click();
    await expect(row.getByRole('button', { name: 'Quitar de mi biblioteca' })).toBeVisible();

    // Al buscar, la sección se oculta
    await page.getByRole('searchbox', { name: 'Buscar' }).fill('B1');
    await expect(news).toBeHidden();
  } finally {
    await api(`/rest/v1/catalog?id=eq.${book.id}`, { method: 'DELETE' });
  }
});

test('lista de deseos para todos: añadir, compartir y ver el enlace público', async ({ page, account, browser }) => {
  const id = await bookId('ref=eq.test:T1');
  await page.goto(`/#/libro/${id}`);
  await page.getByRole('button', { name: '☆ Lo quiero' }).click();
  await expect(page.getByRole('button', { name: '★ En tu lista de deseos' })).toBeVisible();

  await page.goto('/#/deseos');
  await expect(page.locator('.row-title', { hasText: TEST_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Crear enlace para compartir' }).click();
  const link = await page.getByRole('textbox', { name: 'Enlace de tu lista de deseos' }).inputValue();
  expect(link).toMatch(/#\/deseos\/[0-9a-f-]{36}$/);

  // Quien abre el enlace (sin sesión) ve la lista y la invitación a crear la suya
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await useLocalSupabase(gp);
  await gp.goto(link);
  await expect(gp.getByRole('heading', { name: /Lista de deseos de Prueba E2E/ })).toBeVisible();
  await expect(gp.getByText(TEST_TITLE)).toBeVisible();
  await expect(gp.getByRole('link', { name: 'Crea tu biblioteca con Escriba de la Marca' })).toBeVisible();
  await guest.close();
});

test('el canal de llegada (?ref=) se guarda al registrarse y se quita de la URL', async ({ page, account }) => {
  await page.goto('/?ref=Reddit#/biblioteca');
  await expect(page.getByRole('heading', { name: 'Mi biblioteca' })).toBeVisible();
  expect(page.url()).not.toContain('ref=');
  await expect.poll(async () => (await api(`/rest/v1/profiles?id=eq.${account.user.id}&select=signup_ref`))[0].signup_ref)
    .toBe('reddit');
});

test('la portada cuenta una visita anónima por canal', async ({ page }) => {
  const ref = `e2e-${Date.now().toString(36)}`;
  await page.goto(`/?ref=${ref}`);
  await expect(page.getByRole('button', { name: 'Entrar con Google' }).first()).toBeVisible();
  await expect.poll(async () => (await api(`/rest/v1/landing_visits?ref=eq.${ref}&select=visits`))[0]?.visits).toBe(1);
  await page.reload();   // mismo navegador y día: no suma otra
  await page.waitForTimeout(500);
  expect((await api(`/rest/v1/landing_visits?ref=eq.${ref}&select=visits`))[0].visits).toBe(1);
});

test.describe('portadas (admin)', () => {
  test.use({ admin: true });
  test.describe.configure({ mode: 'serial' });   // el segundo borra todas las portadas al terminar

  /** Imagen PNG de prueba: captura de un recuadro de color (cabe en la pantalla del móvil emulado). */
  const fakeCover = async (page, color = '#74398a') => {
    await page.setContent(`<div style="width:300px;height:450px;background:${color}"></div>`);
    return page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 450 } });
  };

  test('subir y quitar la portada desde la ficha', async ({ page, account }) => {
    const id = await bookId('ref=eq.test:T1');
    const png = await fakeCover(page);
    await page.goto(`/#/libro/${id}`);
    await page.locator('[data-cover-file]').setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText(/Portada guardada \(\d+ KB\)/)).toBeVisible();
    const img = page.locator('.book-cover img.cover-lg');
    await expect(img).toHaveAttribute('src', /\/storage\/v1\/object\/public\/covers\//);
    await expect(page.getByText('Portada © de sus autores, con permiso de La Marca del Este')).toBeVisible();
    const src = await img.getAttribute('src');
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeLessThan(100_000);   // reducida y comprimida

    await page.getByRole('button', { name: 'Quitar', exact: true }).click();
    await page.locator('#dialog').getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByText('Portada quitada')).toBeVisible();
    expect((await api(`/rest/v1/catalog?id=eq.${id}&select=cover_url`))[0].cover_url).toBeNull();
    expect((await page.request.get(src)).status()).not.toBe(200);   // el fichero también se borra
  });

  test('subida masiva emparejando por código', async ({ page, account }) => {
    const id = await bookId('ref=eq.test:T1');
    const png = await fakeCover(page, '#b02a1f');
    await page.goto('/#/admin/portadas');
    await page.getByText('Subir varias', { exact: true }).click();          // panel plegable
    await page.locator('[data-bulk]').setInputFiles([
      { name: 'T1 - prueba.png', mimeType: 'image/png', buffer: png },
      { name: 'ZZZ9.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.getByText('→ T1 · [Prueba] Aventura de test')).toBeVisible();
    await expect(page.getByText('Ningún libro con el código «ZZZ9»')).toBeVisible();
    await page.getByRole('button', { name: 'Subir 1 portada' }).click();
    await expect(page.getByText('1 portada subida')).toBeVisible();
    const [book] = await api(`/rest/v1/catalog?id=eq.${id}&select=cover_url`);
    expect(book.cover_url).toMatch(/\/covers\//);
    // Limpieza: el borrado de emergencia deja todo como estaba
    await page.getByText('Borrar todas las portadas', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Borrar todas las portadas' }).click();
    await page.locator('#dialog input[name=word]').fill('PORTADAS');
    await page.locator('#dialog').getByRole('button', { name: 'Borrar todas' }).click();
    await expect(page.getByText(/ficheros borrados; ningún libro tiene portada/)).toBeVisible();
    expect((await api(`/rest/v1/catalog?id=eq.${id}&select=cover_url`))[0].cover_url).toBeNull();
  });
});

test('marcas: leída, jugada y dirigida (sin tener el libro)', async ({ page, account }) => {
  const id = await bookId('ref=eq.test:T1');
  await page.goto(`/#/libro/${id}`);
  const leida = page.getByRole('button', { name: 'Leída' });
  await expect(leida).toHaveAttribute('aria-pressed', 'false');
  await leida.click();
  await expect(leida).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Dirigida' }).click();
  await expect(page.getByRole('button', { name: 'Dirigida' })).toHaveAttribute('aria-pressed', 'true');
  const [m] = await api(`/rest/v1/book_marks?user_id=eq.${account.user.id}&select=read_at,played_at,directed_at`);
  expect(m.read_at).not.toBeNull(); expect(m.played_at).toBeNull(); expect(m.directed_at).not.toBeNull();
  expect(await libraryOf(account.user.id)).toEqual([]);   // marcar no es tenerlo

  // Iconos en el catálogo
  await page.goto('/#/catalogo');
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('T1');
  await expect(page.locator('.row', { hasText: TEST_TITLE }).locator('.mark-icons')).toHaveAttribute('aria-label', 'Leída, Dirigida');

  // Filtro de la biblioteca: se añade y se filtra por «Sin leer» / «Leídos»
  await page.goto(`/#/libro/${id}`);
  await page.getByRole('button', { name: 'Añadir a mi biblioteca' }).click();
  await expect(page.getByRole('button', { name: 'Quitar' })).toBeVisible();
  await page.goto('/#/biblioteca');
  await page.getByText('Por categorías', { exact: true }).click();
  const btn = page.locator('.filters-btn');
  const before = await btn.boundingBox();
  await btn.click();   // los filtros van en un panel plegable
  expect(await btn.boundingBox()).toEqual(before);   // el botón no se mueve al abrir
  const filtro = page.locator('.lib-marks select');
  await filtro.selectOption('unread');
  await expect(page.locator('.filter-count')).toHaveText('1');
  await expect(page.locator('.card-title', { hasText: TEST_TITLE })).toHaveCount(0);
  await filtro.selectOption('read');
  await expect(page.locator('.card-title', { hasText: TEST_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(filtro).toHaveValue('');
  await expect(page.locator('.filter-count')).toBeHidden();
});

test.describe('estadísticas (admin)', () => {
  test.use({ admin: true });
  test('Admin → Estadísticas muestra el periodo, las gráficas y cambia de periodo', async ({ page, account }) => {
    await page.goto('/#/admin/estadisticas');
    await expect(page.getByText('Actividad diaria')).toBeVisible();
    await expect(page.locator('.lchart svg')).toHaveCount(4);
    await page.getByText('7 días', { exact: true }).click();
    await expect(page.getByText('Últimos 7 días comparados con los 7 anteriores.')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar CSV' }).click();
    expect((await download).suggestedFilename()).toBe('escriba-estadisticas-7d.csv');
  });
});

test.describe('resumen (admin)', () => {
  test.use({ admin: true });
  test('Admin → Resumen lista lo pendiente con enlaces directos', async ({ page, account }) => {
    const [b] = await api('/rest/v1/catalog?select=id', { method: 'POST', body: { title: '[Prueba] propuesta e2e', status: 'pending', source: 'app' } });
    try {
      await page.goto('/#/admin');
      const todo = page.locator('.todo-list');
      await expect(todo.getByRole('link', { name: /propuesta.* por revisar/ })).toHaveAttribute('href', '#/revision');
      await expect(page.locator('.kpis .kpi')).toHaveCount(4);
      // Los duplicados del catálogo importado abren el catálogo con el filtro aplicado
      await todo.getByRole('link', { name: /duplicado/ }).click();
      await expect(page).toHaveURL(/#\/catalogo\/duplicates$/);
      await expect(page.locator('[data-dfilter="duplicates"]')).toHaveClass(/on/);
    } finally {
      await api(`/rest/v1/catalog?id=eq.${b.id}`, { method: 'DELETE' });
    }
  });
});

test('buscador: «Más filtros» plegado, con burbuja de filtros activos', async ({ page, account }) => {
  await page.goto('/#/buscar');
  await expect(page.getByRole('spinbutton', { name: 'Nivel del grupo' })).toBeVisible();
  const btn = page.locator('.finder-row .filters-btn');
  await expect(page.locator('#finder-more')).toBeHidden();                 // plegado al entrar
  const before = await btn.boundingBox();
  await btn.click();
  expect(await btn.boundingBox()).toEqual(before);                          // el botón no se mueve al abrir
  await page.locator('#finder-more [data-tag]').first().click();
  await page.getByLabel('Ocultar las que ya he jugado o dirigido').check();
  await expect(page.locator('.finder-row .filter-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.locator('.finder-row .filter-count')).toBeHidden();
});

test('proponer libro: avisa de libros parecidos y sugiere etiquetas existentes', async ({ page, account }) => {
  const id = await bookId('ref=eq.test:T1');
  const [tagged] = await api('/rest/v1/catalog?status=eq.approved&tags=neq.{}&select=tags&limit=1');
  await page.goto('/#/catalogo');
  await page.getByRole('button', { name: '+ Proponer' }).click();
  const dialog = page.locator('#dialog');
  await dialog.getByLabel('Título').fill('aventura de test');
  const hint = dialog.locator('.dup-hint');
  await expect(hint).toContainText(TEST_TITLE);
  await expect(hint).toContainText('título parecido');
  await dialog.getByLabel('Código de barras', { exact: true }).fill(TEST_EAN);
  await expect(hint).toContainText('mismo código de barras');

  // Etiquetas: sugiere las del catálogo y añade una existente sin duplicarla
  const tag = tagged.tags[0];
  const entry = dialog.getByRole('textbox', { name: 'Etiquetas' });
  await entry.fill(tag.slice(0, 3).toLowerCase());
  await dialog.locator('.tag-suggest [data-add]').filter({ hasText: tag }).first().click();
  await expect(dialog.locator('.tag-chips li')).toHaveText([`${tag}×`]);
  await entry.fill(tag.toUpperCase());
  await entry.press('Enter');
  await expect(dialog.locator('.tag-chips li')).toHaveCount(1);

  // Al enviar pide confirmación; «Es este» lleva a la ficha del libro que ya existe
  await dialog.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Proponer igualmente' })).toBeVisible();
  await expect(dialog.locator('.form-error')).toContainText('libros parecidos');
  await hint.locator('li').filter({ hasText: TEST_TITLE }).getByRole('button', { name: 'Es este' }).click();
  await expect(page).toHaveURL(new RegExp(`#/libro/${id}$`));
});

test.describe('categorías (admin)', () => {
  test.use({ admin: true });
  test('Admin → Ajustes: crear, reordenar, renombrar y borrar categorías', async ({ page, account }) => {
    await page.goto('/#/admin/ajustes');
    const list = page.locator('.cat-list');
    // Panel plegado al entrar; se abre y recuerda el estado al volver
    await expect(list).toBeHidden();
    await page.getByText('Categorías', { exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('edm.folds'))).toContain('"ajustes.categorias":true');
    await page.reload();
    await expect(list).toBeVisible();
    const names = () => list.locator('.cat-name').evaluateAll((els) => els.map((e) => e.value));
    try {
      await page.getByRole('textbox', { name: 'Nombre de la nueva categoría' }).fill('Prueba E2E');
      await page.getByRole('button', { name: 'Añadir' }).click();
      await expect(list.locator('li').last().locator('.cat-name')).toHaveValue('Prueba E2E');
      const before = await names();
      await page.getByRole('button', { name: 'Subir Prueba E2E' }).click();
      await expect.poll(names).toEqual([...before.slice(0, -2), 'Prueba E2E', before.at(-2)]);
      const input = list.locator('li').filter({ has: page.getByRole('button', { name: 'Borrar Prueba E2E' }) }).locator('.cat-name');
      await input.fill('Prueba E2E 2');
      await input.blur();
      await expect.poll(async () => (await api('/rest/v1/categories?slug=eq.prueba-e2e&select=name'))[0]?.name).toBe('Prueba E2E 2');
      await page.getByRole('button', { name: 'Borrar Prueba E2E 2' }).click();
      await page.locator('#dialog').getByRole('button', { name: 'Borrar' }).click();
      await expect(list.locator('.cat-name')).toHaveCount(before.length - 1);
      expect(await api('/rest/v1/categories?slug=eq.prueba-e2e&select=id')).toEqual([]);
    } finally {
      await api('/rest/v1/categories?slug=like.prueba-e2e*', { method: 'DELETE' });
    }
  });
});

test('nivel: distintivo en la biblioteca, hoja de progreso y cambio de emblema', async ({ page, account }) => {
  await page.goto('/#/biblioteca');
  const chip = page.locator('.view-head [data-hero]');
  await expect(chip).toHaveAttribute('aria-label', /^Nivel 1, Aprendiz de escriba/);
  await chip.click();
  const dialog = page.locator('#dialog');
  await expect(dialog.getByText('Aprendiz de escriba')).toBeVisible();
  await expect(dialog.getByText(/te faltan 100 PX para el nivel 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cambiar emblema' }).click();
  await dialog.getByRole('radio', { name: 'Búho' }).check({ force: true });
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Emblema: Búho')).toBeVisible();
  const [p] = await api(`/rest/v1/profiles?id=eq.${account.user.id}&select=emblem`);
  expect(p.emblem).toBe('owl');

  // Marcar un libro como jugado da 10 PX (se ve en la hoja)
  const id = await bookId('ref=eq.test:T1');
  await page.goto(`/#/libro/${id}`);
  await page.getByRole('button', { name: 'Jugada' }).click();
  await page.goto('/#/catalogo');
  await page.locator('.view-head [data-hero]').click();
  await expect(dialog.locator('p strong')).toHaveText('10 PX');
});

test('comunidad: pestañas de Escribas y Mecenas, y casilla voluntaria en el perfil', async ({ page, account }) => {
  await page.goto('/#/escribas');                                           // el enlace antiguo lleva a la Comunidad
  await expect(page).toHaveURL(/#\/comunidad\/escribas$/);
  await expect(page.getByRole('heading', { name: 'Comunidad', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Mecenas', exact: true }).click();
  await expect(page).toHaveURL(/#\/comunidad\/mecenas$/);
  await expect(page.locator('.community-list')).not.toContainText('Cargando');
  await page.goto('/#/perfil');
  await page.getByLabel('Aparecer en la lista de Escribas').check();
  await expect(page.getByText('Tu nombre aparecerá en la lista de Escribas')).toBeVisible();
  const [p] = await api(`/rest/v1/profiles?id=eq.${account.user.id}&select=show_in_scribes`);
  expect(p.show_in_scribes).toBe(true);
});

test.describe('códigos con errata (admin)', () => {
  test.use({ admin: true });
  test('registrar un código con el dígito de control mal y encontrarlo escribiéndolo', async ({ page, account }) => {
    const id = await bookId('ref=eq.test:T1');
    const bad = '9780306406158';                                          // el bueno acaba en 7
    try {
      await page.goto('/#/escanear');
      await page.getByRole('textbox', { name: 'Código de barras o de publicación' }).fill(bad);
      await page.getByRole('button', { name: 'Buscar' }).click();
      await expect(page.getByText(/no cuadra/)).toBeVisible();             // aún no registrado: aviso de errata

      await page.goto(`/#/libro/${id}`);
      await page.getByPlaceholder('Añadir código de barras').fill(bad);
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      await page.locator('#dialog').getByRole('button', { name: 'Registrar tal cual' }).click();
      await expect.poll(async () => (await api(`/rest/v1/catalog_barcodes?code=eq.${bad}&select=catalog_id`)).map((r) => r.catalog_id)).toEqual([id]);

      await page.goto('/#/escanear');
      await page.getByRole('textbox', { name: 'Código de barras o de publicación' }).fill(bad);
      await page.getByRole('button', { name: 'Buscar' }).click();
      await expect(page.locator('.scan-result')).toContainText(TEST_TITLE);
    } finally {
      await api(`/rest/v1/catalog_barcodes?code=eq.${bad}`, { method: 'DELETE' });
    }
  });
});

test.describe('descatalogados (admin)', () => {
  test.use({ admin: true });
  test('marcar un libro como descatalogado: etiqueta en la ficha y filtro en la biblioteca', async ({ page, account }) => {
    const [{ id }] = await api('/rest/v1/catalog?select=id', { method: 'POST',
      body: { title: `[Prueba] descatalogado ${test.info().project.name}`, status: 'approved', source: 'app' } });
    try {
      await page.goto(`/#/libro/${id}`);
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('#dialog form').getByLabel(/Descatalogado/).check();
      await page.locator('#dialog form').getByRole('button', { name: 'Guardar' }).click();
      await expect(page.locator('.oop-dd')).toContainText('solo de segunda mano');
      const [b] = await api(`/rest/v1/catalog?id=eq.${id}&select=out_of_print`);
      expect(b.out_of_print).toBe(true);

      await page.goto('/#/biblioteca');
      await page.locator('.filters-btn').click();
      await page.getByLabel('Ver los que me faltan').check();
      await page.locator('.lib-marks select').selectOption('oop');
      await expect(page.locator('.groups')).toContainText(`[Prueba] descatalogado ${test.info().project.name}`);
      await expect(page.locator('.groups .oop-ribbon').first()).toBeAttached();
    } finally {
      await api(`/rest/v1/catalog?id=eq.${id}`, { method: 'DELETE' });
    }
  });
});

test.describe('revisión al día (admin)', () => {
  test.use({ admin: true });
  test('una propuesta que llega con la app abierta aparece al pulsar «Actualizar»', async ({ page, account }) => {
    await page.goto('/#/revision');
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
    const title = `[Prueba] llega tarde ${test.info().project.name}`;
    const [b] = await api('/rest/v1/catalog?select=id', { method: 'POST', body: { title, status: 'pending', source: 'app' } });
    try {
      await expect(page.getByText(title)).toHaveCount(0);
      await page.getByRole('button', { name: 'Actualizar' }).click();
      await expect(page.getByText(title)).toBeVisible();
      await expect(page.locator('#nav [data-admin-tab] .tab-badge')).toBeVisible();
    } finally {
      await api(`/rest/v1/catalog?id=eq.${b.id}`, { method: 'DELETE' });
    }
  });
});

test('aportaciones: pestaña, misiones que abren «Sugerir cambios» y retirar lo pendiente', async ({ page, account }) => {
  const uid = account.user.id;
  const id = await bookId('ref=eq.test:T1');
  await api('/rest/v1/catalog_suggestions', { method: 'POST', body: { catalog_id: id, created_by: uid, changes: { pages: '99' }, status: 'pending' } });
  await page.goto('/#/biblioteca');
  const tab = page.locator('#nav [data-contrib-tab]');
  await expect(tab).toBeVisible();
  await expect(page.locator('#nav [data-admin-tab]')).toBeHidden();
  await tab.click();
  await expect(page).toHaveURL(/#\/aportaciones$/);
  await expect(page.locator('.quest').first()).toBeVisible();
  await expect(page.locator('.quest .wax').first()).toBeVisible();

  // Lo pendiente se puede retirar
  const row = page.locator('.contribs li').filter({ hasText: TEST_TITLE });
  await expect(row.locator('.state')).toHaveText('Pendiente');
  await row.getByRole('button', { name: 'Retirar' }).click();
  await page.locator('#dialog').getByRole('button', { name: 'Retirar' }).click();
  await expect(page.getByText('Propuesta retirada')).toBeVisible();
  expect(await api(`/rest/v1/catalog_suggestions?created_by=eq.${uid}&select=id`)).toEqual([]);

  // Una misión de datos lleva a la ficha con «Sugerir cambios» abierto
  const quest = page.locator('[data-quest-book]').first();
  if (await quest.count()) {
    await quest.click();
    await expect(page).toHaveURL(/#\/libro\//);
    await expect(page.locator('#dialog').getByRole('heading', { name: 'Sugerir cambios' })).toBeVisible();
  }
});

test.describe('misiones (admin)', () => {
  test.use({ admin: true });
  test('Admin → Ajustes → Misiones: cambiar los textos de un tipo y volver a los de por defecto', async ({ page, account }) => {
    await page.goto('/#/admin/ajustes');
    await expect(page.locator('#nav [data-contrib-tab]')).toBeHidden();
    await page.getByText('Misiones', { exact: true }).click();
    const form = page.locator('.quest-form');
    await form.getByLabel('Tipo de misión').selectOption('summary');
    await form.getByLabel(/Variantes del título/).fill('La crónica de prueba de {titulo}');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Textos de la misión guardados')).toBeVisible();
    try {
      const [row] = await api('/rest/v1/app_settings?key=eq.quests&select=value');
      expect(row.value.summary.titles).toEqual(['La crónica de prueba de {titulo}']);
      await page.goto('/#/aportaciones');
      await expect(page.locator('.quest h3').filter({ hasText: 'La crónica de prueba de' })).toBeVisible();
    } finally {
      await api('/rest/v1/app_settings?key=eq.quests', { method: 'DELETE' });
    }
  });
});

test('misión de códigos: lista de libros y «No tiene código»; nombre público en el perfil', async ({ page, account }) => {
  const uid = account.user.id;
  const [b] = await api('/rest/v1/catalog?select=id&status=eq.approved&code=eq.B1');
  await api('/rest/v1/library', { method: 'POST', body: { user_id: uid, catalog_id: b.id } });
  await page.goto('/#/aportaciones');
  const quest = page.locator('.quest').filter({ has: page.locator('.quest-books') });
  await quest.locator('.quest-books summary').click();
  const row = quest.locator(`[data-book="${b.id}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'No tiene código' }).click();
  await page.locator('#dialog').getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Gracias: se revisará pronto')).toBeVisible();
  const [sg] = await api(`/rest/v1/catalog_suggestions?created_by=eq.${uid}&select=changes`);
  expect(sg.changes).toEqual({ no_barcode: true });

  await page.goto('/#/perfil');
  await page.getByLabel('Nombre público').fill('Escriba Errante');
  await page.locator('.public-name-form').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Nombre público: Escriba Errante')).toBeVisible();
  const [p] = await api(`/rest/v1/profiles?id=eq.${uid}&select=public_name`);
  expect(p.public_name).toBe('Escriba Errante');
});

test('código compartido: primero el libro que falta y atajo por código de portada', async ({ page, account }) => {
  const ean = '9780131103627';
  const tag = test.info().project.name === 'móvil' ? 'M' : 'D';
  const books = await api('/rest/v1/catalog?select=id,code', { method: 'POST', body: [
    { title: `[Prueba] compartido A ${tag}`, code: `ZA${tag}`, status: 'approved', source: 'app' },
    { title: `[Prueba] compartido B ${tag}`, code: `ZB${tag}`, status: 'approved', source: 'app' }] });
  const [a, b] = books.sort((x, y) => x.code.localeCompare(y.code));
  try {
    await api('/rest/v1/catalog_barcodes', { method: 'POST', body: books.map((x) => ({ code: ean, catalog_id: x.id, source: 'admin', status: 'approved', verified: true })) });
    await api('/rest/v1/library', { method: 'POST', body: { user_id: account.user.id, catalog_id: a.id } });
    await page.goto('/#/escanear');
    await page.getByRole('textbox', { name: 'Código de barras o de publicación' }).fill(ean);
    await page.getByRole('button', { name: 'Buscar' }).click();
    const picks = page.locator('.scan-result .pick');
    await expect(picks).toHaveCount(2);
    await expect(picks.first()).toContainText(`compartido B ${tag}`);      // el que aún no tiene, primero
    await expect(page.locator('.scan-result')).toContainText(`Atajo: escribe el código de la portada (ZB${tag}, ZA${tag})`);
  } finally {
    await api(`/rest/v1/catalog?id=in.(${a.id},${b.id})`, { method: 'DELETE' });
  }
});

test('orden por código: B10* junto a B10 y B1-LME al final de la serie', async ({ page, account }) => {
  const tag = test.info().project.name === 'móvil' ? 'M' : 'D';
  const made = await api('/rest/v1/catalog?select=id,code', { method: 'POST', body: [
    { title: `[Prueba] orden QZ1-LME ${tag}`, code: 'QZ1-LME', series: null, number: null, status: 'approved', source: 'app' },
    { title: `[Prueba] orden QZ10* ${tag}`, code: 'QZ10*', series: 'QZ', number: null, status: 'approved', source: 'app' },
    { title: `[Prueba] orden QZ10 ${tag}`, code: 'QZ10', series: 'QZ', number: 10, status: 'approved', source: 'app' },
    { title: `[Prueba] orden QZ2 ${tag}`, code: 'QZ2', series: 'QZ', number: 2, status: 'approved', source: 'app' }] });
  try {
    await page.goto('/#/catalogo');
    await page.getByPlaceholder(/Buscar título/).fill(`[Prueba] orden`);
    const codes = await page.locator('.rows .row .code').filter({ hasText: /^QZ/ }).allTextContents();
    expect(codes).toEqual(['QZ2', 'QZ10', 'QZ10*', 'QZ1-LME']);
  } finally {
    await api(`/rest/v1/catalog?id=in.(${made.map((b) => b.id).join(',')})`, { method: 'DELETE' });
  }
});

test.describe('usuarios (admin)', () => {
  test.use({ admin: true });
  test('ficha de usuario y suspender / reactivar', async ({ page, account }) => {
    const { user: other } = await newUserSession('Usuario Ficha');
    try {
      await page.goto('/#/admin/usuarios');
      await page.getByRole('searchbox', { name: 'Buscar usuario' }).fill('Usuario Ficha');
      await page.locator('.user-row .user-name').first().click();
      await expect(page).toHaveURL(new RegExp(`#/admin/usuario/${other.id}$`));
      await expect(page.getByRole('heading', { name: 'Actividad' })).toBeVisible();
      await page.locator('.suspend-reason').fill('Cuenta de prueba');
      await page.getByRole('button', { name: 'Suspender', exact: true }).click();
      await page.locator('#dialog').getByRole('button', { name: 'Suspender' }).click();
      await expect(page.getByText('Cuenta suspendida')).toBeVisible();
      const [p] = await api(`/rest/v1/profiles?id=eq.${other.id}&select=suspended_at,suspended_reason`);
      expect(p.suspended_at).not.toBeNull();
      expect(p.suspended_reason).toBe('Cuenta de prueba');
      await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
      await page.locator('#dialog').getByRole('button', { name: 'Reactivar' }).click();
      await expect(page.getByText('Cuenta reactivada')).toBeVisible();
    } finally {
      await api(`/auth/v1/admin/users/${other.id}`, { method: 'DELETE' });
    }
  });
});

test('perfil público: activarlo en el Perfil y verlo sin sesión', async ({ page, account, browser }) => {
  const slug = `e2e-${test.info().project.name === 'móvil' ? 'm' : 'd'}-${Date.now().toString(36)}`;
  await page.goto('/#/perfil');
  await page.getByText('Perfil público', { exact: true }).click();
  const form = page.locator('[data-pp-form]');
  await form.getByLabel('Perfil público activado').check();
  await form.getByLabel('Dirección del perfil').fill(slug);
  await form.getByLabel('Lema').fill('Ningún módulo queda sin leer');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Perfil público guardado')).toBeVisible();

  const anon = await browser.newContext();
  const p2 = await anon.newPage();
  await useLocalSupabase(p2);
  await p2.goto(`/#/escriba/${slug}`);
  await expect(p2.locator('.pp-id h1')).toBeVisible();
  await expect(p2.locator('.pp-motto')).toContainText('Ningún módulo queda sin leer');
  await expect(p2.getByRole('link', { name: 'Crea tu colección gratis' })).toBeVisible();
  await p2.goto('/#/escriba/no-existe-este-perfil');
  await p2.reload();
  await expect(p2.getByRole('heading', { name: 'Perfil no disponible' })).toBeVisible();
  await anon.close();
});
