import { expect, test } from '@playwright/test';
import { limpiarLimites } from './ayudas/base_datos';
import { entrarComoAdministrador } from './ayudas/escuela';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina, irA } from './ayudas/usuarios';

test.beforeAll(limpiarLimites);

test('sin sesión, las páginas de administración mandan a iniciar sesión', async ({ page }) => {
  await irA(page, '/admin/categorias');
  await expect(page).toHaveURL(/\/iniciar-sesion/);
});

test('un usuario sin rol no ve el enlace Admin y recibe el aviso de permiso', async ({ page, request }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(request, correo);
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await irA(page, '/admin/roles');
  await expect(page.getByRole('alert')).toContainText('No tienes permiso para ver esta página.');
});

test('el administrador da y quita el rol de instructor, y no puede quitarse el suyo', async ({ page, browser, request }) => {
  const otro = correoUnico();
  await crearUsuarioVerificado(request, otro);
  const admin = correoUnico();
  await entrarComoAdministrador(page, admin);
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible();

  await page.getByLabel('Correo de la cuenta').fill(`nadie-${Date.now()}@ejemplo.test`);
  await page.getByRole('button', { name: 'Buscar cuenta' }).click();
  await expect(page.getByRole('alert').first()).toContainText('No se encontró lo que buscas.');

  await page.getByLabel('Correo de la cuenta').fill(otro);
  await page.getByRole('button', { name: 'Buscar cuenta' }).click();
  await expect(page.getByText('Instructor: No')).toBeVisible();
  await page.getByRole('button', { name: 'Dar instructor' }).click();
  await expect(page.getByText('Instructor: Sí')).toBeVisible();

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const pagina = await contexto.newPage();
  await iniciarSesionEnPagina(pagina, otro);
  await expect(pagina.getByRole('link', { name: 'Instructor' })).toBeVisible();
  await contexto.close();

  await page.getByRole('button', { name: 'Quitar instructor' }).click();
  await expect(page.getByText('Instructor: No')).toBeVisible();

  await page.getByLabel('Correo de la cuenta').fill(admin);
  await page.getByRole('button', { name: 'Buscar cuenta' }).click();
  await expect(page.getByText('Administrador: Sí')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar administrador' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Esa acción no está permitida' })).toBeVisible();
  await expect(page.getByText('Administrador: Sí')).toBeVisible();
});

test('el administrador administra categorías', async ({ page }) => {
  await entrarComoAdministrador(page, correoUnico());
  await irA(page, '/admin/categorias');
  await expect(page.getByRole('heading', { name: 'Categorías' })).toBeVisible();

  await page.locator('#nombre_nueva').fill('E2E Anatomía');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.getByText('E2E Anatomía')).toBeVisible();

  await page.locator('#nombre_nueva').fill('E2E Anatomía');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Ya existe una categoría con ese nombre.');

  await page.getByRole('button', { name: 'Editar' }).last().click();
  await page.locator('li input[id^="nombre_"]').fill('E2E Anatomía humana');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('E2E Anatomía humana')).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar' }).last().click();
  await expect(page.getByText('E2E Anatomía humana')).toHaveCount(0);
});
