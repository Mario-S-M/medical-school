import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { crearUsuarioVerificado, iniciarSesionEnPagina } from './usuarios';

const RAIZ = path.resolve(process.cwd(), '..');

export function hacerAdministrador(correo: string) {
  if (!/^[a-z0-9.@_-]+$/.test(correo)) throw new Error('Correo de prueba no válido');
  execFileSync('bash', ['escuela/scripts/crear_administrador.sh', correo], { cwd: RAIZ, stdio: 'ignore' });
}

// Crea una cuenta verificada, le da el rol de administrador e inicia sesión en la página.
export async function entrarComoAdministrador(page: Page, correo: string) {
  await crearUsuarioVerificado(page.request, correo);
  hacerAdministrador(correo);
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
}
