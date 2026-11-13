import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createVerifiedUser, signInOnPage } from './users';

const RAIZ = path.resolve(process.cwd(), '..');

export function makeAdmin(correo: string) {
  if (!/^[a-z0-9.@_-]+$/.test(correo)) throw new Error('Correo de prueba no válido');
  execFileSync('bash', ['api/scripts/create-admin.sh', correo], { cwd: RAIZ, stdio: 'ignore' });
}

// Crea una cuenta verificada, le da el rol de administrador e inicia sesión en la página.
export async function signInAsAdmin(page: Page, correo: string) {
  await createVerifiedUser(page.request, correo);
  makeAdmin(correo);
  await signInOnPage(page, correo);
  await page.waitForURL(/\/panel/);
}
