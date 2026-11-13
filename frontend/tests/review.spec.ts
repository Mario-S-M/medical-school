import type { Page } from '@playwright/test';
import { expect, test } from './helpers/test-base';
import { addLessonE2E, createCategoryE2E, createPublishedCourseE2E, lessonIdE2E, setCourseStatusE2E, grantRole, clearLimits, setCourseCoverE2E, setVideoReadyE2E } from './helpers/database';
import { signInAsAdmin } from './helpers/school';
import { uniqueEmail, createVerifiedUser, signInOnPage, visit } from './helpers/users';

const TITULO = 'E2E Ciclo de revisión';

test.beforeAll(() => {
  clearLimits();
  createCategoryE2E('E2E Ciencias');
});

async function entrarComoInstructor(page: Page) {
  const correo = uniqueEmail();
  await createVerifiedUser(page.request, correo);
  grantRole(correo, 'instructor');
  await signInOnPage(page, correo);
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
  await expect(page.getByText('Clase uno').first()).toBeVisible();
  setCourseCoverE2E(TITULO);
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hay clases sin video listo.' })).toBeVisible();
  setVideoReadyE2E(TITULO);
  await page.reload();
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'En revisión' })).toBeVisible();
  await expect(page.getByLabel('Subtítulo')).toBeDisabled();

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const admin = await contexto.newPage();
  await signInAsAdmin(admin, uniqueEmail());
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

  await visit(admin, '/admin/revision');
  await admin.locator('li', { has: admin.getByRole('heading', { name: TITULO }) }).first().getByRole('button', { name: 'Aprobar y publicar' }).click();
  await expect(admin.getByRole('heading', { name: TITULO })).toHaveCount(0);
  await contexto.close();

  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Publicado' })).toBeVisible();
});

test('la tarjeta de revisión ofrece "Ver clase" solo en las clases con video listo', async ({ page }) => {
  const titulo = 'E2E Revisión con enlaces';
  createPublishedCourseE2E(titulo, 'e2e-revision-enlaces');
  addLessonE2E(titulo, 'Clase con video', false, true);
  addLessonE2E(titulo, 'Clase sin video', false, false);
  setCourseStatusE2E(titulo, 'en_revision');
  await signInAsAdmin(page, uniqueEmail());
  await visit(page, '/admin/revision');
  const tarjeta = page.locator('li', { has: page.getByRole('heading', { name: titulo }) }).first();
  await expect(tarjeta.getByText('Clase sin video')).toBeVisible();
  const enlaces = tarjeta.getByRole('link', { name: /^Ver clase/ });
  await expect(enlaces).toHaveCount(1);
  await expect(enlaces).toHaveAttribute('href', `/clase?id=${lessonIdE2E(titulo, 'Clase con video')}`);
});
