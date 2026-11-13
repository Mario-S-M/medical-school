import { expect, test } from './helpers/test-base';
import { readdirSync, readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { clearLimits, grantRole } from './helpers/database';
import { uniqueEmail, createVerifiedUser, signInOnPage, visit } from './helpers/users';

test.beforeAll(clearLimits);

const MANIFEST = JSON.parse(readFileSync('../api/graphql/persisted-queries.json', 'utf8')) as Record<string, string>;

type Body = { operationName: string; extensions: { persistedQuery: { sha256Hash: string } } };

// Cada petición lleva solo el hash (sin `query`), el hash está en el manifiesto y corresponde a la operación que dice.
function expectPersisted(cuerpos: Record<string, unknown>[]) {
  for (const cuerpo of cuerpos) {
    expect(cuerpo).not.toHaveProperty('query');
    const { operationName, extensions } = cuerpo as Body;
    const hash = extensions.persistedQuery.sha256Hash;
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(MANIFEST[hash]).toMatch(new RegExp(`^(query|mutation) ${operationName}\\b`));
  }
}

function collect(page: Page) {
  const cuerpos: Record<string, unknown>[] = [];
  const rutas: string[] = [];
  const conToken: string[] = [];
  page.on('request', (r) => {
    const { pathname } = new URL(r.url());
    rutas.push(pathname);
    if (pathname !== '/api/graphql') return;
    cuerpos.push(r.postDataJSON());
    if (r.headers().authorization) conToken.push((r.postDataJSON() as Body).operationName);
  });
  return { cuerpos, rutas, conToken, nombres: () => new Set(cuerpos.map((c) => (c as Body).operationName)) };
}

test('las peticiones a /api/graphql llevan solo el hash persistido', async ({ page, request }) => {
  const { cuerpos } = collect(page);
  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  await signInOnPage(page, correo);
  await expect(page).toHaveURL(/\/panel/);
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();

  expect(cuerpos.length).toBeGreaterThan(0);
  expectPersisted(cuerpos);
});

test('todas las operaciones del front están en el manifiesto', () => {
  const nombres = new Set(Object.values(MANIFEST).map((q) => /^(?:query|mutation) (\w+)/.exec(q)?.[1]));
  const archivos = readdirSync('src/features', { recursive: true, encoding: 'utf8' }).filter((f) => /api[\\/][^\\/]+\.(query|mutation)\.ts$/.test(f));
  expect(archivos.length).toBe(Object.keys(MANIFEST).length); // 33 operaciones: 12 consultas y 21 mutaciones
  for (const archivo of archivos) {
    const operacion = /graphql\(`\s*(?:query|mutation) (\w+)/.exec(readFileSync(`src/features/${archivo}`, 'utf8'))?.[1];
    expect(nombres.has(operacion), archivo).toBe(true);
  }
});

test('la escuela va por GraphQL con hash y sin rutas /escuela', async ({ page, request }) => {
  const { cuerpos, rutas, conToken, nombres } = collect(page);
  await visit(page, '/cursos');
  await expect(page.getByRole('heading', { name: 'Cursos' }).first()).toBeVisible();
  expect(nombres()).toEqual(new Set(['categorias', 'cursos']));
  expect(conToken).toEqual([]); // el catálogo público no envía token

  const correo = uniqueEmail();
  await createVerifiedUser(request, correo);
  grantRole(correo, 'instructor');
  grantRole(correo, 'administrador');
  await signInOnPage(page, correo);
  await page.waitForURL(/\/panel/);
  await page.getByRole('link', { name: 'Instructor' }).click();
  await page.getByLabel('Título del curso nuevo').fill('Curso de hashes E2E');
  await page.getByRole('button', { name: 'Crear curso' }).click();
  await page.getByLabel('Título de la sección').fill('Sección uno');
  await page.getByRole('button', { name: 'Añadir sección' }).click();
  await expect(page.getByText('Sección uno').first()).toBeVisible();
  await visit(page, '/admin/revision');
  await visit(page, '/instructor/equipo');
  await visit(page, '/admin/categorias');
  await visit(page, '/admin/roles');

  expectPersisted(cuerpos);
  for (const nombre of ['categorias', 'cursos', 'mis_roles', 'mis_invitaciones', 'mis_cursos', 'crear_curso', 'curso_edicion', 'guardar_seccion', 'cursos_en_revision', 'mi_equipo'])
    expect(nombres(), nombre).toContain(nombre);
  expect(rutas.filter((ruta) => ruta.startsWith('/escuela'))).toEqual([]);
});

test('tras cerrar sesión el caché no devuelve el usuario anterior', async ({ page, request }) => {
  const [correoA, correoB] = [uniqueEmail(), uniqueEmail()];
  await createVerifiedUser(request, correoA, 'Persona Anterior');
  await createVerifiedUser(request, correoB, 'Persona Nueva');

  await signInOnPage(page, correoA);
  await expect(page.getByRole('heading', { name: 'Hola, Persona Anterior' })).toBeVisible();
  await page.locator('main').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion/);

  // La navegación del cliente conserva el QueryClient (singleton de módulo): si el caché sobreviviera, saldría la persona anterior.
  await page.locator('#correo').fill(correoB);
  await page.locator('#contrasena').fill('Clave-Segura#2026xyz');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Hola, Persona Nueva' })).toBeVisible();
  await expect(page.getByText(correoB)).toBeVisible();
  await expect(page.getByText(correoA)).toHaveCount(0);
  await visit(page, '/panel');
  await expect(page.getByRole('heading', { name: 'Hola, Persona Nueva' })).toBeVisible();
});
