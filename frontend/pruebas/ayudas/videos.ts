import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { darRol } from './base_datos';
import { correoUnico, crearUsuarioVerificado, iniciarSesionEnPagina } from './usuarios';

const RAIZ = path.resolve(process.cwd(), '..');
const CARPETA = mkdtempSync(path.join(tmpdir(), 'videos-e2e-'));

// Genera un MP4 diminuto de `minutos` de duración con el ffmpeg del transcodificador (1 fotograma por segundo, 64x64).
export function generarVideo(nombre: string, minutos: number): string {
  const destino = path.join(CARPETA, `${nombre}.mp4`);
  execFileSync('docker', ['compose', 'exec', '-T', 'transcodificador', 'ffmpeg', '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=1',
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', String(minutos * 60), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', `/trabajo/${nombre}.mp4`], { cwd: RAIZ });
  execFileSync('docker', ['compose', 'cp', `transcodificador:/trabajo/${nombre}.mp4`, destino], { cwd: RAIZ, stdio: 'ignore' });
  return destino;
}

// Crea un instructor, un curso con una sección y una clase "Clase de video", y deja la página en el editor del curso.
export async function prepararClase(page: Page, titulo: string) {
  const correo = correoUnico();
  await crearUsuarioVerificado(page.request, correo);
  darRol(correo, 'instructor');
  await iniciarSesionEnPagina(page, correo);
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill(titulo);
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await page.getByLabel('Título de la sección').fill('Sección de video');
  await page.getByRole('button', { name: 'Añadir sección' }).click();
  await page.getByLabel('Título de la clase').fill('Clase de video');
  await page.getByRole('button', { name: 'Añadir clase' }).click();
  await expect(page.getByText('Sin video')).toBeVisible();
}
