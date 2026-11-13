import { expect, test } from './helpers/test-base';
import { clearLimits, delaySending } from './helpers/database';
import { countEmails, waitForCode } from './helpers/mailpit';
import { PASSWORD, NAME, uniqueEmail, visit } from './helpers/users';

test.beforeAll(clearLimits);

async function rellenarRegistro(page: import('@playwright/test').Page, correo: string, contrasena = PASSWORD) {
  await visit(page, '/registro');
  await page.locator('#nombre').fill(NAME);
  await page.locator('#correo').fill(correo);
  await page.locator('#contrasena').fill(contrasena);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
}

test('registro, código erróneo, reenvío y verificación', async ({ page }) => {
  const correo = uniqueEmail();
  await rellenarRegistro(page, correo);
  await expect(page).toHaveURL(/\/verificar-correo/);
  await expect(page.locator('#correo')).toHaveValue(correo);

  await page.locator('#codigo').fill('000000');
  await page.getByRole('button', { name: 'Verificar correo' }).click();
  await expect(page.getByRole('alert')).toHaveText('El código no es válido o venció.');
  await expect(page).toHaveURL(/\/verificar-correo/);

  const previos = await countEmails(correo);
  delaySending(correo);
  await page.getByRole('button', { name: 'Reenviar código' }).click();
  const codigo = await waitForCode(correo, previos);
  await expect(page.getByRole('button', { name: /Reenviar código \(\d+ s\)/ })).toBeDisabled();

  await page.locator('#codigo').fill(codigo);
  await page.getByRole('button', { name: 'Verificar correo' }).click();
  await expect(page.getByRole('status')).toContainText('Correo verificado');
});

test('contraseña rechazada por la API se muestra junto al campo', async ({ page }) => {
  await rellenarRegistro(page, uniqueEmail(), 'Password1234!');
  await expect(page.getByRole('alert')).toHaveText('La contraseña no cumple los requisitos.');
  await expect(page.locator('#contrasena-errores li').first()).toBeVisible();
  await expect(page.getByLabel('Requisitos de la contraseña')).toContainText('✓ Una mayúscula');
});
