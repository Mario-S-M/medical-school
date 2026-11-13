import { expect, test } from './helpers/test-base';
import { deleteTestEmails } from './helpers/mailpit';
import { addLessonE2E, cleanSchoolE2E, clearLimits, deleteUsersE2E, lessonIdE2E, markSampleE2E, setCourseStateE2E } from './helpers/database';
import { isPaused, openClass, playAndWait, recordHlsErrors, recordPlaybackTokens, recordRequests, stage, video, currentTime } from './helpers/player';
import { generateRealVideo, prepareLesson } from './helpers/videos';

// Estas pruebas usan Google Chrome (proyecto "video"): el Chromium de Playwright no reproduce H.264/AAC.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const COURSE = 'E2E Reproductor';
const NOT_READY = 'El video de esta clase todavía no está listo.';
const NO_ACCESS = 'Esta clase no está disponible para tu cuenta.';
const TAMPER = 'La marca de agua se quitó o se ocultó. Recarga la página para continuar.';
let sample = 0;
let regular = 0;
let withoutVideo = 0;

// Un curso publicado con una muestra con video real (22 s), una clase normal y una muestra sin video.
test.beforeAll(async ({ browser }) => {
  clearLimits();
  const file = generateRealVideo('e2e_reproductor', 22);
  const page = await browser.newPage({ baseURL: 'http://localhost:4321' });
  await prepareLesson(page, COURSE);
  await page.locator('input[id^="video_"]').setInputFiles(file);
  await expect(page.getByText(/Video listo/)).toBeVisible({ timeout: 90_000 });
  await page.close();
  markSampleE2E(COURSE, 'Clase de video');
  addLessonE2E(COURSE, 'Clase normal', false, true);
  addLessonE2E(COURSE, 'Muestra sin video', true, false);
  setCourseStateE2E(COURSE, 'publicado');
  [sample, regular, withoutVideo] = ['Clase de video', 'Clase normal', 'Muestra sin video'].map((name) => lessonIdE2E(COURSE, name));
});

test.afterAll(async () => {
  await cleanSchoolE2E();
  deleteUsersE2E();
  await deleteTestEmails();
});

test('el video se reproduce y el token solo viaja hacia la API de reproducción', async ({ page }) => {
  const errors = recordHlsErrors(page);
  const requests = recordRequests(page);
  const tokens = recordPlaybackTokens(page);
  const email = await openClass(page, sample);
  await playAndWait(page);
  await expect(video(page)).toHaveAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
  await expect(video(page)).toHaveJSProperty('disablePictureInPicture', true);
  await expect(video(page)).toHaveJSProperty('disableRemotePlayback', true);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests.count('/almacen/')).toBeGreaterThan(0);
  const withAuthorization = await requests.withAuthorization();
  expect(withAuthorization.some((url) => url.includes('/api/v1/reproducciones/') && url.endsWith('/clave'))).toBe(true);
  for (const url of withAuthorization) expect(url).toMatch(/\/api\/(v1\/reproducciones\/|graphql|v1\/)/);
  expect(withAuthorization.filter((url) => url.includes('/almacen/'))).toEqual([]);
  expect(tokens).toHaveLength(1);
  expect(requests.urls().filter((url) => url.includes(tokens[0]))).toEqual([]);
  const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]));
  expect(storage).not.toContain(tokens[0]);
  expect(JSON.stringify(await page.context().cookies())).not.toContain(tokens[0]);
  await expect(stage(page).getByText(email)).toBeVisible();
});

test('la marca de agua muestra el correo, cambia de lugar y no recibe clics', async ({ page }) => {
  const email = await openClass(page, sample);
  await playAndWait(page);
  const mark = stage(page).getByText(email);
  await expect(mark).toBeVisible();
  const first = await mark.boundingBox();
  await expect.poll(async () => JSON.stringify(await mark.boundingBox()), { timeout: 12_000 }).not.toBe(JSON.stringify(first));
  expect(await mark.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(Number(await mark.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  // el clic atraviesa la marca: en su centro el elemento más alto no es ella
  expect(await mark.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await isPaused(page)).toBe(false);
});

const tampers: [string, (el: HTMLElement) => void][] = [
  ['quitarla del DOM', (el) => el.remove()],
  ['display none', (el) => (el.style.display = 'none')],
  ['visibility hidden', (el) => (el.style.visibility = 'hidden')],
  ['opacidad 0', (el) => (el.style.opacity = '0')],
  ['color transparent', (el) => (el.style.color = 'transparent')],
  ['color con alfa 0', (el) => (el.style.color = 'rgba(255, 255, 255, 0)')],
  ['-webkit-text-fill-color transparent', (el) => el.style.setProperty('-webkit-text-fill-color', 'transparent')],
  ['filter opacity(0)', (el) => (el.style.filter = 'opacity(0)')],
  ['filter blur(12px)', (el) => (el.style.filter = 'blur(12px)')],
  ['clip-path', (el) => (el.style.clipPath = 'inset(50%)')],
  ['mix-blend-mode', (el) => (el.style.mixBlendMode = 'multiply')],
  ['tamaño de letra mínimo', (el) => (el.style.fontSize = '1px')],
  ['recortarla a un punto', (el) => Object.assign(el.style, { width: '2px', height: '2px', overflow: 'hidden' })],
  ['texto fuera de su caja', (el) => (el.style.textIndent = '-9999px')],
  ['tapada por un elemento dentro del contenedor', (el) => el.parentElement!.insertAdjacentHTML('beforeend', '<div style="position:absolute;inset:0;z-index:15;background:#000"></div>')],
  ['tapada por un elemento fijo fuera del contenedor', () => document.body.insertAdjacentHTML('beforeend', '<div id="tapa" style="position:fixed;inset:0;z-index:99999;background:#000"></div>')],
];
for (const [name, tamper] of tampers) {
  test(`manipular la marca (${name}) pausa el video en menos de 3 s y avisa`, async ({ page }) => {
    const email = await openClass(page, sample);
    await playAndWait(page);
    await stage(page).getByText(email).evaluate(tamper);
    await expect.poll(() => isPaused(page), { timeout: 3000 }).toBe(true);
    await expect(page.getByRole('alert').filter({ hasText: TAMPER })).toBeVisible();
    await expect(stage(page).getByText(email)).toBeVisible(); // la marca se restauró
    await video(page).evaluate((v: HTMLVideoElement) => v.play().catch(() => undefined));
    await expect.poll(() => isPaused(page)).toBe(true); // mientras siga bloqueado el play vuelve a pausar
  });
}

// Ancestros: el contenedor o la página entera. No se puede restaurar la marca desde dentro, así que solo se comprueba la pausa.
const ancestors: [string, () => void][] = [
  ['opacidad 0,05 en el contenedor', () => ((document.querySelector('[aria-label="Reproductor de la clase"]') as HTMLElement).style.opacity = '0.05')],
  ['opacidad 0,3 en dos ancestros (0,3 x 0,3 x 0,35)', () => {
    (document.querySelector('[aria-label="Reproductor de la clase"]') as HTMLElement).style.opacity = '0.3';
    document.body.style.opacity = '0.3';
  }],
  ['visibility hidden heredado del contenedor', () => ((document.querySelector('[aria-label="Reproductor de la clase"]') as HTMLElement).style.visibility = 'hidden')],
  ['display none en el contenedor', () => ((document.querySelector('[aria-label="Reproductor de la clase"]') as HTMLElement).style.display = 'none')],
  ['display none en el cuerpo de la página', () => (document.body.style.display = 'none')],
];
for (const [name, tamper] of ancestors) {
  test(`manipular un ancestro (${name}) pausa el video en menos de 3 s`, async ({ page }) => {
    await openClass(page, sample);
    await playAndWait(page);
    await page.evaluate(tamper);
    // sin getByRole: un contenedor oculto sale del árbol de accesibilidad
    await expect.poll(() => page.evaluate(() => document.querySelector('video')!.paused), { timeout: 3000 }).toBe(true);
  });
}

test('sin manipulación no hay falsos positivos: varias reproducciones, móvil, scroll y pantalla completa', async ({ page }) => {
  await openClass(page, sample);
  for (let round = 1; round <= 3; round++) {
    if (round > 1) await page.reload();
    if (round === 3) await page.setViewportSize({ width: 360, height: 640 });
    await playAndWait(page);
    await page.waitForTimeout(3500); // varias vueltas de la vigilancia (1 s) y al menos un cambio de posición de la marca
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await isPaused(page)).toBe(false);
    await page.mouse.wheel(0, 120); // el video queda parcialmente bajo la cabecera fija
    await page.waitForTimeout(1500);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Pantalla completa' }).click();
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await isPaused(page)).toBe(false);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('la autorización se renueva al 80 % de su vida y el video sigue sin detenerse', async ({ page }) => {
  let authorizations = 0;
  await page.route('**/api/graphql', async (route) => {
    if (!route.request().postData()?.includes('autorizar_reproduccion')) return route.fallback();
    authorizations++;
    const response = await route.fetch();
    const body = await response.json();
    body.data.autorizar_reproduccion.expira_en = 10; // renovación real a los 8 s
    await route.fulfill({ response, json: body });
  });
  const requests = recordRequests(page);
  const errors = recordHlsErrors(page);
  await openClass(page, sample);
  await playAndWait(page);
  // mide en la página la parada más larga del tiempo de reproducción (un corte de la renovación se vería aquí)
  await video(page).evaluate((v: HTMLVideoElement) => {
    const state = { last: v.currentTime, since: Date.now(), longest: 0 };
    (window as unknown as { stall: typeof state }).stall = state;
    setInterval(() => {
      if (v.currentTime !== state.last) Object.assign(state, { last: v.currentTime, since: Date.now() });
      state.longest = Math.max(state.longest, Date.now() - state.since);
    }, 50);
  });
  await expect.poll(() => authorizations, { timeout: 15_000 }).toBe(2);
  const renewedAt = await currentTime(page);
  await expect.poll(() => currentTime(page), { timeout: 10_000 }).toBeGreaterThan(renewedAt + 2);
  expect(await page.evaluate(() => (window as unknown as { stall: { longest: number } }).stall.longest)).toBeLessThan(1500);
  expect(await isPaused(page)).toBe(false);
  expect(requests.count('lista.m3u8')).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

const SEGMENT = /segmento_(\d+)\.ts/;

test('una URL firmada vencida (403 en un segmento) renueva la autorización, vuelve a pedir la lista y el video continúa', async ({ page }) => {
  let authorizations = 0;
  let denied = 0;
  await page.route('**/api/graphql', (route) => (route.request().postData()?.includes('autorizar_reproduccion') && authorizations++, route.fallback()));
  // simula las URL firmadas vencidas: mientras no haya renovación, todo segmento salvo el primero responde 403
  await page.route(SEGMENT, (route) => {
    const index = Number(route.request().url().match(SEGMENT)![1]);
    if (authorizations >= 2 || index === 0) return route.fallback();
    denied++;
    return route.fulfill({ status: 403, body: 'vencida' });
  });
  const requests = recordRequests(page);
  await openClass(page, sample);
  await expect.poll(() => authorizations, { timeout: 30_000 }).toBe(2);
  expect(denied).toBeGreaterThan(0);
  await playAndWait(page);
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(8); // pasó el primer segmento: ya usa las URL nuevas
  expect(requests.count('lista.m3u8')).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(authorizations).toBe(2);
});

test('si la renovación falla se avisa en español y el video no se queda colgado en silencio', async ({ page }) => {
  let authorizations = 0;
  await page.route('**/api/graphql', async (route) => {
    if (!route.request().postData()?.includes('autorizar_reproduccion')) return route.fallback();
    if (++authorizations === 1) {
      const response = await route.fetch();
      const body = await response.json();
      body.data.autorizar_reproduccion.expira_en = 10;
      return route.fulfill({ response, json: body });
    }
    return route.fulfill({ status: 200, json: { data: null, errors: [{ message: 'sin permiso', extensions: { codigo: 'SIN_PERMISO' } }] } });
  });
  await openClass(page, sample);
  await playAndWait(page);
  const alert = page.getByRole('alert').filter({ hasText: 'Esta clase no está disponible para tu cuenta.' });
  await expect(alert).toContainText('Recarga la página para seguir viendo la clase.', { timeout: 15_000 });
  expect(authorizations).toBe(2);
});

test('una clase que no es muestra no está disponible y no se pide lista ni clave', async ({ page }) => {
  const requests = recordRequests(page);
  await openClass(page, regular);
  await expect(page.getByText(NO_ACCESS)).toBeVisible();
  expect(requests.count('/api/v1/reproducciones/')).toBe(0);
});

test('una muestra sin video listo avisa que todavía no está lista', async ({ page }) => {
  await openClass(page, withoutVideo);
  await expect(page.getByText(NOT_READY)).toBeVisible();
});

test('una clase inexistente y un id inválido no rompen la página', async ({ page }) => {
  await openClass(page, 999999999);
  await expect(page.getByText('La clase no existe o ya no está disponible.')).toBeVisible();
  await page.goto('/clase?id=abc');
  await expect(page.getByText('Falta indicar la clase.')).toBeVisible();
  await page.goto('/clase');
  await expect(page.getByText('Falta indicar la clase.')).toBeVisible();
});

test('sin sesión /clase lleva a iniciar sesión', async ({ page }) => {
  await page.goto(`/clase?id=${sample}`);
  await page.waitForURL(/\/iniciar-sesion/);
});

test('sin MSE se muestra el aviso del navegador', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { MediaSource?: unknown }).MediaSource;
    delete (window as { ManagedMediaSource?: unknown }).ManagedMediaSource;
  });
  await openClass(page, sample);
  await expect(page.getByText('Tu navegador no puede reproducir este video. Prueba con otro navegador.')).toBeVisible();
});

test('la pantalla completa es la del contenedor y la marca sigue visible', async ({ page }) => {
  const email = await openClass(page, sample);
  await playAndWait(page);
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
  expect(await stage(page).evaluate((el) => document.fullscreenElement === el)).toBe(true);
  await expect(stage(page).getByText(email)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Pantalla completa' })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});
