import { expect, type ConsoleMessage, type Page, type Request } from '@playwright/test';
import { createVerifiedUser, signInOnPage, uniqueEmail } from './users';

// Crea una cuenta de estudiante, inicia sesión y abre /clase?id=… (con la cuenta lista para mirar las peticiones).
export async function openClass(page: Page, lessonId: number | string) {
  const email = uniqueEmail();
  await createVerifiedUser(page.request, email);
  await signInOnPage(page, email);
  await page.waitForURL(/\/panel/);
  await page.goto(`/clase?id=${lessonId}`);
  return email;
}

export const stage = (page: Page) => page.getByRole('group', { name: 'Reproductor de la clase' });
export const video = (page: Page) => stage(page).locator('video');
export const currentTime = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime);
export const isPaused = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.paused);

// Pulsa reproducir (foco en el video y barra espaciadora, como en los controles nativos; el clic de Playwright no los activa) y espera a que el tiempo avance más de 1 s.
export async function playAndWait(page: Page) {
  await expect(video(page)).toBeVisible();
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => {
      if (await isPaused(page)) {
        await video(page).focus();
        await page.keyboard.press('Space');
      }
      return currentTime(page);
    }, { timeout: 20_000 })
    .toBeGreaterThan(1);
}

// Registra las peticiones de la página para revisar después a qué URL fue cada cabecera Authorization.
export function recordRequests(page: Page) {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return {
    urls: () => requests.map((r) => r.url()),
    count: (part: string) => requests.filter((r) => r.url().includes(part)).length,
    withAuthorization: async () => {
      const headers = await Promise.all(requests.map(async (r) => ({ url: r.url(), authorization: (await r.allHeaders()).authorization })));
      return headers.filter((h) => h.authorization).map((h) => h.url);
    },
  };
}

// Errores y avisos de consola de hls.js o de peticiones de lista, clave y segmentos (/api/v1/reproducciones, /almacen),
// y errores sin capturar de la página.
export function recordHlsErrors(page: Page) {
  const problems: string[] = [];
  const related = (m: ConsoleMessage) => /hls/i.test(m.text()) || /\/(api\/v1\/reproducciones|almacen)\//.test(m.location().url);
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && related(m) && problems.push(m.text()));
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

// Guarda el token que entrega `autorizar_reproduccion` (solo para comprobar que no aparece en ninguna parte).
export function recordPlaybackTokens(page: Page) {
  const tokens: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('/api/graphql') || !response.request().postData()?.includes('autorizar_reproduccion')) return;
    const body = await response.json().catch(() => null);
    const token = body?.data?.autorizar_reproduccion?.token;
    if (token) tokens.push(token);
  });
  return tokens;
}
