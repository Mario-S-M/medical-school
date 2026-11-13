import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test-base';
import { clearLimits } from './helpers/database';
import { generateVideo, prepareLesson } from './helpers/videos';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);
test.beforeAll(clearLimits);

const AVISO = '¿Estás seguro de que quieres subir una clase tan grande?';

test('un video de 5 minutos se sube sin avisos y queda listo', async ({ page }) => {
  const archivo = generateVideo('e2e_5', 5);
  await prepareLesson(page, 'E2E Video normal');
  await expect(page.getByText('Recomendamos clases de entre 2 y 9 minutos.')).toBeVisible();
  await page.locator('input[id^="video_"]').setInputFiles(archivo);
  await expect(page.getByText(AVISO)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Ver clase/ })).toHaveCount(0);
  await expect(page.getByText(/Video listo \(5 min\)/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'Ver clase Clase de video' })).toHaveAttribute('href', /^\/clase\?id=\d+$/);
  await expect(page.getByText('Reemplazar el video de «Clase de video»')).toBeVisible();
});

test('un video de 10 minutos avisa, se puede cancelar y se puede subir de todos modos', async ({ page }) => {
  const archivo = generateVideo('e2e_10', 10);
  await prepareLesson(page, 'E2E Video largo');
  const solicitudes: string[] = [];
  page.on('request', (r) => r.url().includes('/api/v1/videos/firmas') && solicitudes.push(r.url()));
  await page.locator('input[id^="video_"]').setInputFiles(archivo);
  await expect(page.getByText(AVISO)).toBeVisible();
  await expect(page.getByText(/Preferimos clases más cortas/)).toBeVisible();
  await page.getByRole('button', { name: 'Elegir otro archivo' }).click();
  await expect(page.getByText(AVISO)).toHaveCount(0);
  expect(solicitudes).toHaveLength(0);
  await expect(page.getByText('Sin video')).toBeVisible();

  await page.locator('input[id^="video_"]').setInputFiles(archivo);
  await page.getByRole('button', { name: 'Subir de todos modos' }).click();
  await expect(page.getByText(/Video listo \(10 min\)/)).toBeVisible({ timeout: 90_000 });
  expect(solicitudes).toHaveLength(1);
});

test('un video de 31 minutos y uno de más de 1 GB se rechazan sin subirse', async ({ page }) => {
  const archivo = generateVideo('e2e_31', 31);
  await prepareLesson(page, 'E2E Video rechazado');
  const solicitudes: string[] = [];
  page.on('request', (r) => r.url().includes('/api/v1/videos/firmas') && solicitudes.push(r.url()));
  await page.locator('input[id^="video_"]').setInputFiles(archivo);
  await expect(page.getByRole('alert').filter({ hasText: 'dura 31 minutos y el máximo es 30' })).toBeVisible();

  await page.locator('input[id^="video_"]').evaluate((entrada: HTMLInputElement) => {
    const grande = new File(['x'], 'enorme.mp4', { type: 'video/mp4' });
    Object.defineProperty(grande, 'size', { value: 1024 * 1024 * 1024 + 1 });
    const lista = new DataTransfer();
    lista.items.add(grande);
    entrada.files = lista.files;
    entrada.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('alert').filter({ hasText: 'el máximo es 1 GB' })).toBeVisible();
  expect(solicitudes).toHaveLength(0);
  await expect(page.getByText('Sin video')).toBeVisible();
});

test('reemplazar y borrar el video, y reintentar uno corrupto', async ({ page }) => {
  const archivo = generateVideo('e2e_3', 3);
  await prepareLesson(page, 'E2E Video reemplazo');
  await page.locator('input[id^="video_"]').setInputFiles(archivo);
  await expect(page.getByText(/Video listo \(3 min\)/)).toBeVisible({ timeout: 90_000 });

  const roto = path.join(path.dirname(archivo), 'roto.mp4');
  writeFileSync(roto, Buffer.alloc(30_000, 7));
  await page.locator('input[id^="video_"]').setInputFiles(roto);
  await expect(page.getByText(/Error: El archivo está dañado/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Video listo \(3 min\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar video de Clase de video' }).click();
  await expect(page.getByText(/Error: El archivo está dañado/)).toBeVisible({ timeout: 90_000 });

  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar video Clase de video' }).click();
  await expect(page.getByText('Sin video')).toBeVisible();
  await expect(page.getByText('Subir el video de «Clase de video»')).toBeVisible();
});
