import { expect, test } from './helpers/test-base';
import { clearLimits } from './helpers/database';
import { PASSWORD, NAME, uniqueEmail, createVerifiedUser, signInOnPage, visit, registerUnverified } from './helpers/users';

test.beforeAll(clearLimits);

test('cuenta sin verificar lleva a verificar-correo', async ({ page, request }) => {
  const correo = uniqueEmail();
  await registerUnverified(request, correo);
  await signInOnPage(page, correo);
  await expect(page).toHaveURL(/\/verificar-correo/);
  await expect(page.locator('#correo')).toHaveValue(correo);
});

test('sesión: panel, recarga, almacenamiento y cierre', async ({ page, context, request }) => {
  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  await signInOnPage(page, correo);
  await expect(page).toHaveURL(/\/panel/);
  await expect(page.getByRole('heading', { name: `Hola, ${NAME}` })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: `Hola, ${NAME}` })).toBeVisible();
  const visible = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie);
  expect(visible).not.toContain('token');
  expect(visible).not.toContain(PASSWORD);
  const cookie = (await context.cookies()).find((c) => c.name === 'token_renovacion')!;
  expect(cookie.httpOnly).toBe(true);

  await page.locator('main').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);
  await visit(page, '/panel');
  await expect(page).toHaveURL(/\/iniciar-sesion/);
  const vieja = await request.post('/api/v1/sesiones/renovacion', {
    headers: { Cookie: `token_renovacion=${cookie.value}`, 'X-Solicitado-Con': 'front' },
  });
  expect(vieja.status()).toBe(401);
});

test('contraseña incorrecta y bloqueo con cuenta regresiva', async ({ page, request }) => {
  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  await signInOnPage(page, correo, 'Otra-Clave#2026abc');
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  for (let i = 0; i < 4; i++) {
    const r = await request.post('/api/v1/sesiones', { data: { correo, contrasena: 'Otra-Clave#2026abc' } });
    expect(r.status()).toBe(401);
  }
  await page.locator('#contrasena').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Demasiados intentos fallidos');
  await expect(page.getByRole('button', { name: /Espera \d+ s/ })).toBeDisabled();
});

test('el token de acceso solo vive en memoria: no está en localStorage, sessionStorage ni cookies legibles', async ({ page, request }) => {
  const email = uniqueEmail();
  await createVerifiedUser(request, email);
  const accessToken = new Promise<string>((resolve) => {
    page.on('response', async (r) => {
      if (r.url().endsWith('/api/v1/sesiones') && r.request().method() === 'POST') resolve((await r.json()).token_acceso);
    });
  });
  await signInOnPage(page, email);
  await expect(page).toHaveURL(/\/panel/);
  await expect(page.getByRole('heading', { name: `Hola, ${NAME}` })).toBeVisible();

  const token = await accessToken;
  expect(token.length).toBeGreaterThan(20);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }) + document.cookie);
  expect(stored).not.toContain(token);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.value.includes(token))).toBe(false);
});
