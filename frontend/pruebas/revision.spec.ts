import { expect, test, type Page } from '@playwright/test';
import { crearCategoriaE2E, darRol, limpiarLimites, ponerPortadaCursoE2E } from './ayudas/base_datos';
import { entrarComoAdministrador } from './ayudas/escuela';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina, irA } from './ayudas/usuarios';

const TITULO = 'E2E Ciclo de revisión';

test.beforeAll(() => {
  limpiarLimites();
  crearCategoriaE2E('E2E Ciencias');
});

async function entrarComoInstructor(page: Page) {
  const correo = correoUnico();
  await crearUsuarioVerificado(page.request, correo);
  darRol(correo, 'instructor');
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
}

test('ciclo completo: faltantes, envío, devolución con comentario, reenvío y publicación', async ({ page, browser }) => {
  await entrarComoInstructor(page);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill(TITULO);
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByRole('heading', { name: 'Temario', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  const faltas = page.getByRole('alert').filter({ hasText: 'Antes de enviarlo a revisión' });
  await expect(faltas).toContainText('Falta el subtítulo.');
  await expect(faltas).toContainText('Falta la portada.');
  await expect(faltas).toContainText('El curso necesita al menos una sección.');

  await page.getByLabel('Subtítulo').fill('Un curso de prueba');
  await page.getByLabel('Descripción', { exact: true }).fill('Descripción del curso de prueba.');
  await page.getByLabel('Nivel').selectOption('basico');
  await page.getByLabel('Categoría').selectOption({ label: 'E2E Ciencias' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await page.getByLabel('Título de la sección').fill('Primera sección');
  await page.getByRole('button', { name: 'Añadir sección' }).click();
  await page.getByLabel('Título de la clase').fill('Clase uno');
  await page.getByRole('button', { name: 'Añadir clase' }).click();
  await expect(page.getByText('Clase uno')).toBeVisible();
  ponerPortadaCursoE2E(TITULO);
  await page.reload();
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'En revisión' })).toBeVisible();
  await expect(page.getByLabel('Subtítulo')).toBeDisabled();

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const admin = await contexto.newPage();
  await entrarComoAdministrador(admin, correoUnico());
  await admin.getByRole('link', { name: 'Admin' }).click();
  await admin.getByRole('link', { name: 'Revisión' }).click();
  const tarjeta = admin.locator('li', { has: admin.getByRole('heading', { name: TITULO }) }).first();
  await expect(tarjeta.getByText('Clase uno')).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Devolver con comentario' }).click();
  await expect(tarjeta.getByText('Explica al instructor qué debe cambiar.')).toBeVisible();
  await tarjeta.getByLabel(/Comentario para el instructor/).fill('Agrega una descripción a la clase uno.');
  await tarjeta.getByRole('button', { name: 'Devolver con comentario' }).click();
  await expect(admin.getByRole('heading', { name: TITULO })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador' })).toBeVisible();
  await expect(page.getByText('Agrega una descripción a la clase uno.')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'En revisión' })).toBeVisible();

  await irA(admin, '/admin/revision');
  await admin.locator('li', { has: admin.getByRole('heading', { name: TITULO }) }).first().getByRole('button', { name: 'Aprobar y publicar' }).click();
  await expect(admin.getByRole('heading', { name: TITULO })).toHaveCount(0);
  await contexto.close();

  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Publicado' })).toBeVisible();
});
