import { expect, test } from './helpers/test-base';
import { clearLimits } from './helpers/database';
import { countEmails, waitForCode } from './helpers/mailpit';
import { PASSWORD, uniqueEmail, createVerifiedUser, signInOnPage, visit } from './helpers/users';

test.beforeAll(clearLimits);
const NUEVA = 'Nueva-Clave#2027abc';

async function pedirCodigo(page: import('@playwright/test').Page, correo: string) {
  await visit(page, '/recuperar');
  await page.locator('#correo').fill(correo);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page).toHaveURL(/\/restablecer/);
}

test('recuperar, restablecer y cerrar sesiones abiertas', async ({ page, browser, request }) => {
  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  const otro = await browser.newContext();
  const paginaVieja = await otro.newPage();
  await signInOnPage(paginaVieja, correo);
  await expect(paginaVieja).toHaveURL(/\/panel/);

  const previos = await countEmails(correo);
  await pedirCodigo(page, correo);
  await expect(page.locator('#correo')).toHaveValue(correo);
  const codigo = await waitForCode(correo, previos);

  await page.locator('#codigo').fill('000000');
  await page.locator('#contrasena').fill(NUEVA);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText('El código no es válido o venció.');

  await page.locator('#codigo').fill(codigo);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);

  await signInOnPage(page, correo, PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await signInOnPage(page, correo, NUEVA);
  await expect(page).toHaveURL(/\/panel/);

  await paginaVieja.reload();
  await expect(paginaVieja).toHaveURL(/\/iniciar-sesion/);
  await otro.close();
});

test('recuperar un correo inexistente se ve igual y no envía correo', async ({ page }) => {
  const correo = uniqueEmail();
  await pedirCodigo(page, correo);
  await page.waitForTimeout(1500);
  expect(await countEmails(correo)).toBe(0);
});
