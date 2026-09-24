// Flujo principal: portada, bienvenida, escanear con la entrada manual, añadir, quitar y deshacer, modo marcar.
// Usa el libro de prueba de supabase/seed.sql (T1, EAN 9780306406157) y el catálogo real de las migraciones (serie B).
import { test, expect, api, useLocalSupabase } from './fixtures.js';

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
});

test.describe('bienvenida', () => {
  test.use({ onboarded: false });

  test('se muestra la primera vez y lleva a la ayuda', async ({ page, account }) => {
    await page.goto('/#/biblioteca');
    const dialog = page.locator('#dialog');
    await expect(dialog.getByRole('heading', { name: 'Escanea tus libros' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Siguiente' }).click();
    await dialog.getByRole('button', { name: 'Siguiente' }).click();
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
    const id = await bookId('ref=eq.test:T1');
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
    // Deja el libro de prueba como estaba para los demás tests
    await api(`/rest/v1/catalog?id=eq.${id}`, { method: 'PATCH', body: { catalog_date: null, price_eur: null, binding: null } });
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
