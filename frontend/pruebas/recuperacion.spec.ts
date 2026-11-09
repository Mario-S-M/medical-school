import { expect, test } from '@playwright/test';
import { limpiarLimites } from './ayudas/base_datos';
import { contarCorreos, esperarCodigo } from './ayudas/mailpit';
import { CONTRASENA, correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina, irA } from './ayudas/usuarios';

test.beforeAll(limpiarLimites);
const NUEVA = 'Nueva-Clave#2027abc';

async function pedirCodigo(page: import('@playwright/test').Page, correo: string) {
  await irA(page, '/recuperar');
  await page.locator('#correo').fill(correo);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page).toHaveURL(/\/restablecer/);
}

test('recuperar, restablecer y cerrar sesiones abiertas', async ({ page, browser, request }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(request, correo);
  const otro = await browser.newContext();
  const paginaVieja = await otro.newPage();
  await iniciarSesionEnPagina(paginaVieja, correo);
  await expect(paginaVieja).toHaveURL(/\/panel/);

  const previos = await contarCorreos(correo);
  await pedirCodigo(page, correo);
  await expect(page.locator('#correo')).toHaveValue(correo);
  const codigo = await esperarCodigo(correo, previos);

  await page.locator('#codigo').fill('000000');
  await page.locator('#contrasena').fill(NUEVA);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText('El código no es válido o venció.');

  await page.locator('#codigo').fill(codigo);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);

  await iniciarSesionEnPagina(page, correo, CONTRASENA);
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await iniciarSesionEnPagina(page, correo, NUEVA);
  await expect(page).toHaveURL(/\/panel/);

  await paginaVieja.reload();
  await expect(paginaVieja).toHaveURL(/\/iniciar-sesion/);
  await otro.close();
});

test('recuperar un correo inexistente se ve igual y no envía correo', async ({ page }) => {
  const correo = correoUnico();
  await pedirCodigo(page, correo);
  await page.waitForTimeout(1500);
  expect(await contarCorreos(correo)).toBe(0);
});
