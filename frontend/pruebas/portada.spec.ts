import { expect, test } from '@playwright/test';
import { darRol, limpiarLimites } from './ayudas/base_datos';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina } from './ayudas/usuarios';

// PNG de 1x1 píxel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.beforeAll(limpiarLimites);

test('el instructor sube la portada, la cambia y se rechazan archivos no válidos', async ({ page }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(page.request, correo);
  darRol(correo, 'instructor');
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill('E2E Curso con portada');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByText('Todavía no hay portada.')).toBeVisible();

  const entrada = page.locator('#portada');
  await entrada.setInputFiles({ name: 'portada.gif', mimeType: 'image/gif', buffer: PNG });
  await expect(page.getByRole('alert').filter({ hasText: 'La portada debe ser una imagen JPG, PNG o WebP.' })).toBeVisible();
  await entrada.setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]) });
  await expect(page.getByRole('alert').filter({ hasText: 'La portada no puede pesar más de 2 MB.' })).toBeVisible();

  await entrada.setInputFiles({ name: 'portada.png', mimeType: 'image/png', buffer: PNG });
  const imagen = page.getByAltText('Portada del curso');
  await expect(imagen).toBeVisible();
  const primera = await imagen.getAttribute('src');
  expect(primera).toMatch(/^\/almacen\/object\/public\/portadas\/cursos\/\d+\/portada-[0-9a-f]{32}\.png$/);
  await expect.poll(() => imagen.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByAltText('Portada del curso')).toHaveAttribute('src', primera!);
  await page.locator('#portada').setInputFiles({ name: 'otra.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText('Portada del curso')).not.toHaveAttribute('src', primera!);
  expect((await page.request.get(primera!)).status()).not.toBe(200);
});
