import type { APIRequestContext, Page } from '@playwright/test';
import { esperarCodigo } from './mailpit';

export const CONTRASENA = 'Clave-Segura#2026xyz';
export const NOMBRE = 'Prueba E2E';

export const correoUnico = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@ejemplo.test`;

export async function registrarSinVerificar(request: APIRequestContext, correo: string) {
  await request.post('/autenticacion/registro', { data: { correo, nombre: NOMBRE, contrasena: CONTRASENA } });
}

export async function crearUsuarioVerificado(request: APIRequestContext, correo: string) {
  await registrarSinVerificar(request, correo);
  const codigo = await esperarCodigo(correo);
  await request.post('/autenticacion/verificar-correo', { data: { correo, codigo } });
}

// Abre la página y espera a que React hidrate los formularios.
export async function irA(page: Page, ruta: string) {
  await page.goto(ruta);
  await page.waitForLoadState('networkidle');
}

export async function iniciarSesionEnPagina(page: Page, correo: string, contrasena = CONTRASENA) {
  await irA(page, '/iniciar-sesion');
  await page.locator('#correo').fill(correo);
  await page.locator('#contrasena').fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
}
