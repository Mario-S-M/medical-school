import { expect, test } from '@playwright/test';
import { darRol, limpiarLimites } from './ayudas/base_datos';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina, irA } from './ayudas/usuarios';

test.beforeAll(limpiarLimites);

test('el instructor invita, la persona acepta, edita con permisos de equipo y luego es retirada', async ({ page, browser }) => {
  const invitado = correoUnico();
  await crearUsuarioVerificado(page.request, invitado);
  const instructor = correoUnico();
  await crearUsuarioVerificado(page.request, instructor);
  darRol(instructor, 'instructor');
  await iniciarSesionEnPagina(page, instructor);
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill('E2E Curso del equipo');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByRole('heading', { name: 'Temario', exact: true })).toBeVisible();

  await irA(page, '/instructor/equipo');
  await page.getByLabel('Correo de la persona a invitar').fill(`nadie-${Date.now()}@ejemplo.test`);
  await page.getByRole('button', { name: 'Invitar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Ese correo no tiene una cuenta registrada.' })).toBeVisible();
  await page.getByLabel('Correo de la persona a invitar').fill(invitado);
  await page.getByRole('button', { name: 'Invitar' }).click();
  await expect(page.getByText(invitado)).toBeVisible();
  await expect(page.getByText('No hay invitaciones pendientes.')).toHaveCount(0);

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const otra = await contexto.newPage();
  await iniciarSesionEnPagina(otra, invitado);
  await otra.waitForURL(/\/panel/);
  await expect(otra.getByRole('link', { name: 'Instructor' })).toHaveCount(0);
  await expect(otra.getByRole('heading', { name: 'Invitaciones' })).toBeVisible();
  await expect(otra.getByText('te invitó a su equipo de apoyo.')).toBeVisible();
  await otra.getByRole('button', { name: 'Aceptar' }).click();
  await otra.waitForURL(/\/instructor$/);
  const tarjeta = otra.getByRole('link', { name: 'E2E Curso del equipo' });
  await expect(tarjeta).toBeVisible();
  await expect(otra.getByText('equipo de apoyo)')).toBeVisible();
  await expect(otra.getByRole('link', { name: 'Mi equipo de apoyo' })).toHaveCount(0);
  await tarjeta.click();
  await expect(otra.getByText('Eres parte del equipo de apoyo')).toBeVisible();
  await expect(otra.getByLabel('Subtítulo')).toBeDisabled();
  await otra.getByLabel('Título de la sección').fill('Sección del equipo');
  await otra.getByRole('button', { name: 'Añadir sección' }).click();
  await expect(otra.getByRole('heading', { name: '1. Sección del equipo' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Todavía no tienes miembros.')).toHaveCount(0);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: `Quitar ${invitado}` }).click();
  await expect(page.getByText('Todavía no tienes miembros.')).toBeVisible();

  await irA(otra, '/instructor');
  await expect(otra.getByRole('alert')).toContainText('No tienes permiso para ver esta página.');
  await contexto.close();
});

test('rechazar una invitación no da ningún permiso', async ({ page, browser }) => {
  const invitado = correoUnico();
  await crearUsuarioVerificado(page.request, invitado);
  const instructor = correoUnico();
  await crearUsuarioVerificado(page.request, instructor);
  darRol(instructor, 'instructor');
  await iniciarSesionEnPagina(page, instructor);
  await page.waitForURL(/\/panel/);
  await irA(page, '/instructor/equipo');
  await page.getByLabel('Correo de la persona a invitar').fill(invitado);
  await page.getByRole('button', { name: 'Invitar' }).click();
  await expect(page.getByText(invitado)).toBeVisible();

  const contexto = await browser.newContext({ baseURL: 'http://localhost:4321' });
  const otra = await contexto.newPage();
  await iniciarSesionEnPagina(otra, invitado);
  await otra.waitForURL(/\/panel/);
  await otra.getByRole('button', { name: 'Rechazar' }).click();
  await expect(otra.getByRole('heading', { name: 'Invitaciones' })).toHaveCount(0);
  await irA(otra, '/instructor');
  await expect(otra.getByRole('alert')).toContainText('No tienes permiso para ver esta página.');
  await contexto.close();
});
