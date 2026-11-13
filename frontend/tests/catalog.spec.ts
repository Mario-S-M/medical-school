import { expect, test } from './helpers/test-base';
import { addLessonE2E, lessonIdE2E, clearCourseCoverE2E, createCategoryE2E, createPublishedCourseE2E, clearLimits, setCourseCoverE2E } from './helpers/database';
import { signInAsAdmin } from './helpers/school';
import { uniqueEmail, visit } from './helpers/users';

test.beforeAll(() => {
  clearLimits();
  createCategoryE2E('E2E Ciencias');
  createPublishedCourseE2E('E2E Anatomía del catálogo', 'e2e-anatomia-catalogo', 'intermedio', 0);
  for (let i = 1; i <= 12; i++) createPublishedCourseE2E(`E2E Curso de relleno ${i}`, `e2e-relleno-${i}`, 'basico', i);
});

test('el catálogo es público: paginación, filtros, búsqueda y menú de categorías', async ({ page }) => {
  await visit(page, '/cursos?categoria=e2e-ciencias');
  await expect(page.getByText('13 cursos')).toBeVisible();
  await expect(page.locator('main ul li')).toHaveCount(12);
  await expect(page.getByText('Página 1 de 2')).toBeVisible();
  await page.getByRole('link', { name: 'Siguiente' }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await expect(page.locator('main ul li')).toHaveCount(1);

  await visit(page, '/cursos?categoria=e2e-ciencias');
  await page.getByLabel('Nivel').selectOption('avanzado');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByText('No encontramos cursos con esos filtros.')).toBeVisible();
  await page.getByLabel('Nivel').selectOption('intermedio');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.getByText('1 curso', { exact: true })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Buscar cursos' }).fill('ANATOMÍA');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('link', { name: /E2E Anatomía del catálogo/ })).toBeVisible();

  await page.getByText('Categorías', { exact: true }).click();
  await page.getByRole('link', { name: 'E2E Ciencias', exact: true }).click();
  await expect(page).toHaveURL(/categoria=e2e-ciencias/);
});

test('la ficha pública muestra el temario y las clases muestra, pero ningún video', async ({ page }) => {
  await visit(page, '/cursos?q=anatomia');
  await page.getByRole('link', { name: /E2E Anatomía del catálogo/ }).click();
  await expect(page).toHaveURL(/\/curso\?c=e2e-anatomia-catalogo/);
  await expect(page.getByRole('heading', { name: 'E2E Anatomía del catálogo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temario' })).toBeVisible();
  await expect(page.getByText('Clase de muestra')).toBeVisible();
  await expect(page.getByText('Muestra', { exact: true })).toBeVisible();
  await expect(page.getByText('5 min')).toBeVisible();
  await expect(page.locator('video, source, iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retirar del catálogo' })).toHaveCount(0);

  await visit(page, '/curso?c=no-existe-e2e');
  await expect(page.getByRole('alert')).toContainText('El curso no existe o ya no está disponible.');
});

test('la portada muestra los cursos recientes', async ({ page }) => {
  await visit(page, '/');
  await expect(page.getByRole('heading', { name: 'Cursos recientes' })).toBeVisible();
  expect(await page.locator('section[aria-labelledby="recientes"] li').count()).toBeLessThanOrEqual(6);
});

test('un administrador retira un curso desde su ficha', async ({ page }) => {
  await signInAsAdmin(page, uniqueEmail());
  await visit(page, '/curso?c=e2e-relleno-12');
  await page.getByText('Retirar este curso del catálogo').click();
  await page.getByRole('button', { name: 'Retirar del catálogo' }).click();
  await expect(page.getByText('Explica al instructor por qué se retira.')).toBeVisible();
  await page.getByLabel('Motivo (lo verá el instructor)').fill('Contenido desactualizado');
  await page.getByRole('button', { name: 'Retirar del catálogo' }).click();
  await expect(page).toHaveURL(/\/cursos$/);
  await visit(page, '/cursos?categoria=e2e-ciencias');
  await expect(page.getByText('12 cursos')).toBeVisible();
});

test('una portada que no carga se reemplaza por el fondo de la tarjeta, sin imagen rota', async ({ page }) => {
  const titulo = 'E2E Anatomía del catálogo';
  setCourseCoverE2E(titulo); // apunta a un archivo que no existe en Storage
  try {
    const fallida = page.waitForResponse((r) => r.url().includes('/portadas/cursos/e2e/portada.png') && !r.ok());
    await visit(page, '/cursos?q=anatomia');
    await fallida;
    const tarjeta = page.getByRole('link', { name: /E2E Anatomía del catálogo/ });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('img')).toHaveCount(0);
    await expect(tarjeta.locator('[aria-hidden="true"].bg-gradient-to-br')).toHaveCount(1);

    await tarjeta.click();
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
  } finally {
    clearCourseCoverE2E(titulo);
  }
});

test('la ficha pública ofrece "Ver clase" solo en las clases muestra y lleva a iniciar sesión sin sesión', async ({ page }) => {
  addLessonE2E('E2E Anatomía del catálogo', 'Clase que no es muestra', false, true);
  await visit(page, '/curso?c=e2e-anatomia-catalogo');
  await expect(page.getByText('Clase que no es muestra')).toBeVisible();
  const enlaces = page.getByRole('link', { name: /^Ver clase/ });
  await expect(enlaces).toHaveCount(1);
  const id = lessonIdE2E('E2E Anatomía del catálogo', 'Clase de muestra');
  await expect(enlaces).toHaveAttribute('href', `/clase?id=${id}`);
  await expect(enlaces).toHaveAccessibleName('Ver clase Clase de muestra');
  await enlaces.click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);
});
