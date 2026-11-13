import type { APIRequestContext, Page } from '@playwright/test';
import { waitForCode } from './mailpit';

export const PASSWORD = 'Clave-Segura#2026xyz';
export const NAME = 'Prueba E2E';

export const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@ejemplo.test`;

export async function registerUnverified(request: APIRequestContext, correo: string, nombre = NAME) {
  await request.post('/api/v1/usuarios', { data: { correo, nombre, contrasena: PASSWORD } });
}

export async function createVerifiedUser(request: APIRequestContext, correo: string, nombre = NAME) {
  await registerUnverified(request, correo, nombre);
  const codigo = await waitForCode(correo);
  await request.post('/api/v1/verificaciones-correo', { data: { correo, codigo } });
}

// Abre la página y espera a que React hidrate los formularios.
export async function visit(page: Page, ruta: string) {
  await page.goto(ruta);
  await page.waitForLoadState('networkidle');
}

export async function signInOnPage(page: Page, correo: string, contrasena = PASSWORD) {
  await visit(page, '/iniciar-sesion');
  await page.locator('#correo').fill(correo);
  await page.locator('#contrasena').fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
}
