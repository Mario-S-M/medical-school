import { expect, test } from '@playwright/test';
import { darRol, limpiarLimites } from './ayudas/base_datos';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina } from './ayudas/usuarios';

test.beforeAll(limpiarLimites);

test('el instructor arma el temario: secciones, clases, orden y borrado', async ({ page }) => {
  const correo = correoUnico();
  await crearUsuarioVerificado(page.request, correo);
  darRol(correo, 'instructor');
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill('E2E Temario completo');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByRole('heading', { name: 'Temario', exact: true })).toBeVisible();
  await expect(page.getByText('Todavía no hay secciones.')).toBeVisible();

  const titulos = page.locator('main h3');
  await page.getByLabel('Título de la sección').fill('Introducción');
  await page.getByRole('button', { name: 'Añadir sección' }).click();
  await expect(titulos).toHaveText(['1. Introducción']);
  await page.getByLabel('Título de la sección').last().fill('Huesos');
  await page.getByRole('button', { name: 'Añadir sección' }).click();
  await expect(titulos).toHaveText(['1. Introducción', '2. Huesos']);

  const primera = page.locator('li', { has: page.getByRole('heading', { name: '1. Introducción' }) }).first();
  await primera.getByLabel('Título de la clase').fill('Bienvenida');
  await primera.getByLabel('Duración estimada (minutos)').fill('4');
  await primera.getByLabel('Clase muestra (la verá cualquier visitante)').check();
  await primera.getByRole('button', { name: 'Añadir clase' }).click();
  await expect(primera.getByText('Bienvenida').first()).toBeVisible();
  await expect(primera.getByText('Muestra', { exact: true })).toBeVisible();
  await expect(primera.getByText('4 min')).toBeVisible();

  await primera.getByLabel('Duración estimada (minutos)').fill('500');
  await primera.getByLabel('Título de la clase').fill('Otra');
  await primera.getByRole('button', { name: 'Añadir clase' }).click();
  await expect(primera.getByText('La duración es un número entero de minutos, de 1 a 180.')).toBeVisible();

  await page.getByRole('button', { name: 'Bajar Introducción' }).click();
  await expect(titulos).toHaveText(['1. Huesos', '2. Introducción']);
  await expect(page.getByRole('button', { name: 'Subir Huesos' })).toBeDisabled();

  await page.getByRole('button', { name: 'Renombrar Huesos' }).click();
  await page.locator('input[id^="seccion_titulo_"]').first().fill('Huesos largos');
  await page.getByRole('button', { name: 'Guardar sección' }).click();
  await expect(titulos).toHaveText(['1. Huesos largos', '2. Introducción']);

  await page.reload();
  await expect(titulos).toHaveText(['1. Huesos largos', '2. Introducción']);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar Bienvenida' }).click();
  await expect(page.getByText('Bienvenida')).toHaveCount(0);
  await page.getByRole('button', { name: 'Borrar Huesos largos' }).click();
  await expect(titulos).toHaveText(['1. Introducción']);
});
