import { expect, test } from './helpers/test-base';
import { createCategoryE2E, grantRole, clearLimits, setCourseStateE2E } from './helpers/database';
import { uniqueEmail, createVerifiedUser, signInOnPage, visit } from './helpers/users';

test.beforeAll(() => {
  clearLimits();
  createCategoryE2E('E2E Ciencias');
});

async function entrarComoInstructor(page: import('@playwright/test').Page) {
  const correo = uniqueEmail();
  await createVerifiedUser(page.request, correo);
  grantRole(correo, 'instructor');
  await signInOnPage(page, correo);
  await page.waitForURL(/\/panel/);
}

test('un usuario sin rol no puede abrir Mis cursos', async ({ page, request }) => {
  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  await signInOnPage(page, correo);
  await page.waitForURL(/\/panel/);
  await expect(page.getByRole('link', { name: 'Instructor' })).toHaveCount(0);
  await visit(page, '/instructor');
  await expect(page.getByRole('alert')).toContainText('No tienes permiso para ver esta página.');
});

test('el instructor crea un curso y edita sus datos', async ({ page }) => {
  await entrarComoInstructor(page);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await expect(page.getByRole('heading', { name: 'Mis cursos' })).toBeVisible();

  await page.getByLabel('Título del curso nuevo').fill('Ana');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByText('El título debe tener entre 5 y 120 caracteres.')).toBeVisible();

  await page.getByLabel('Título del curso nuevo').fill('E2E Anatomía básica');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page).toHaveURL(/\/instructor\/curso\?id=\d+/);
  await expect(page.getByRole('heading', { name: 'E2E Anatomía básica' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Borrador' })).toBeVisible();

  await page.getByLabel('Subtítulo').fill('Huesos y músculos');
  await page.getByLabel('Lo que aprenderás').fill('Nombrar los huesos\nEntender las articulaciones');
  await page.getByLabel('Nivel').selectOption('basico');
  await page.getByLabel('Categoría').selectOption({ label: 'E2E Ciencias' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Subtítulo')).toHaveValue('Huesos y músculos');
  await expect(page.getByLabel('Lo que aprenderás')).toHaveValue('Nombrar los huesos\nEntender las articulaciones');
  await expect(page.getByLabel('Nivel')).toHaveValue('basico');

  await page.getByLabel('Título', { exact: true }).fill('Ana');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('El título debe tener entre 5 y 120 caracteres.')).toBeVisible();
});

test('un curso en revisión no se puede editar y uno ajeno no se abre', async ({ page, browser }) => {
  await entrarComoInstructor(page);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill('E2E Curso en revisión');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page).toHaveURL(/\/instructor\/curso\?id=\d+/);
  const url = page.url();

  setCourseStateE2E('E2E Curso en revisión', 'en_revision');
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'En revisión' })).toBeVisible();
  await expect(page.getByLabel('Subtítulo')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const otra = await contexto.newPage();
  await entrarComoInstructor(otra);
  await visit(otra, new URL(url).pathname + new URL(url).search);
  await expect(otra.getByRole('alert').filter({ hasText: 'No tienes permiso' })).toBeVisible();
  await contexto.close();
});
