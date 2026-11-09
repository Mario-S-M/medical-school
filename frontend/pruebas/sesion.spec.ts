import { expect, test } from '@playwright/test';
import { limpiarLimites } from './ayudas/base_datos';
import { CONTRASENA, NOMBRE, correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina, irA, registrarSinVerificar } from './ayudas/usuarios';

test.beforeAll(limpiarLimites);

test('cuenta sin verificar lleva a verificar-correo', async ({ page, request }) => {
  const correo = correoUnico();
  await registrarSinVerificar(request, correo);
  await iniciarSesionEnPagina(page, correo);
  await expect(page).toHaveURL(/\/verificar-correo/);
  await expect(page.locator('#correo')).toHaveValue(correo);
});

test('sesión: panel, recarga, almacenamiento y cierre', async ({ page, context, request }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(request, correo);
  await iniciarSesionEnPagina(page, correo);
  await expect(page).toHaveURL(/\/panel/);
  await expect(page.getByRole('heading', { name: `Hola, ${NOMBRE}` })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: `Hola, ${NOMBRE}` })).toBeVisible();
  const visible = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie);
  expect(visible).not.toContain('token');
  expect(visible).not.toContain(CONTRASENA);
  const cookie = (await context.cookies()).find((c) => c.name === 'token_renovacion')!;
  expect(cookie.httpOnly).toBe(true);

  await page.locator('main').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);
  await irA(page, '/panel');
  await expect(page).toHaveURL(/\/iniciar-sesion/);
  const vieja = await request.post('/autenticacion/renovar', {
    headers: { Cookie: `token_renovacion=${cookie.value}`, 'X-Solicitado-Con': 'front' },
  });
  expect(vieja.status()).toBe(401);
});

test('contraseña incorrecta y bloqueo con cuenta regresiva', async ({ page, request }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(request, correo);
  await iniciarSesionEnPagina(page, correo, 'Otra-Clave#2026abc');
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  for (let i = 0; i < 4; i++) {
    const r = await request.post('/autenticacion/iniciar-sesion', { data: { correo, contrasena: 'Otra-Clave#2026abc' } });
    expect(r.status()).toBe(401);
  }
  await page.locator('#contrasena').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Demasiados intentos fallidos');
  await expect(page.getByRole('button', { name: /Espera \d+ s/ })).toBeDisabled();
});
