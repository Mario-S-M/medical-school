import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { StorageService } from '../src/modules/storage/services/storage.service';
import { cleanup, newIp, sql } from './helpers/real-env';
import { Account, courseCount, giveRole, newAccount, removeAccountResidue, run } from './helpers/school-gql';
import { startSchool } from './helpers/start-school';

// SPEC 12, paso 3: vida de la URL firmada y del token de reproducción. La app corre EN PROCESO con la autorización en 60 s (el
// mínimo permitido) contra el Storage real, con objetos sintéticos. Dura poco más de un minuto: hay una espera REAL.

jest.setTimeout(150_000);

const STORAGE = `http://127.0.0.1:${process.env.KONG_HTTP_PORT ?? '8000'}/storage/v1`;
const TAG = `${process.pid}`;
const LIFETIME_MS = 60_000;
const SEGMENTS = [Buffer.from('segmento uno 1111'), Buffer.from('segmento dos 22')];

let app: NestFastifyApplication;
let storage: StorageService;
const userIds: string[] = [];
let student: Account;
let courseId = 0;
let before = 0;

const get = (path: string, token: string) => request(app.getHttpServer()).get(path).set('X-Forwarded-For', newIp()).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-vida-%'`);
  before = courseCount();
  app = await startSchool({ playbackSeconds: 60 });
  storage = app.get(StorageService, { strict: false });
  const instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  student = await newAccount(userIds);
});
afterAll(async () => {
  if (courseId) await storage.deletePrefix('videos', `cursos/${courseId}`);
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-vida-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before);
});

it('la URL firmada de un segmento sirve ahora y deja de servir tras ~65 s; el token de reproducción caducado da 401 en lista y clave', async () => {
  const owner = userIds[0];
  courseId = Number(sql(`insert into escuela.cursos (slug, instructor_id, titulo, estado) values ('zz-e2e-vida-${TAG}', '${owner}', 'ZZ Vida ${TAG}', 'publicado') returning id`));
  const sectionId = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${courseId}, 'Sección', 1) returning id`));
  const lessonId = Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion, es_muestra) values (${sectionId}, 'Clase', 1, true) returning id`));
  const basePath = `cursos/${courseId}/secciones/${sectionId}/clases/${lessonId}/videos/vida-${TAG}`;
  const videoId = Number(
    sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base, listo_en)
         values (${lessonId}, 'listo', true, 'clase.mp4', 'video/mp4', 1000, 10, '${basePath}', now()) returning id`),
  );
  sql(`insert into escuela.claves_video (video_id, clave) values (${videoId}, decode('00112233445566778899aabbccddeeff', 'hex'))`);
  const put = async (path: string, body: Buffer, type: string): Promise<void> => {
    const r = await fetch(`${STORAGE}${await storage.signUpload('videos', path)}`, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(body) });
    expect(r.status).toBe(200);
  };
  await put(`${basePath}/hls/lista.m3u8`, Buffer.from(['#EXTM3U', '#EXT-X-TARGETDURATION:6', '#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x0123456789ABCDEF0123456789ABCDEF', '#EXTINF:6.0,', 'segmento_00001.ts', '#EXTINF:3.0,', 'segmento_00002.ts', '#EXT-X-ENDLIST', ''].join('\n')), 'application/vnd.apple.mpegurl');
  for (const [i, bytes] of SEGMENTS.entries()) await put(`${basePath}/hls/segmento_0000${i + 1}.ts`, bytes, 'video/mp2t');

  const body = await run(app, 'mutation($c: EnteroGrande!) { autorizar_reproduccion(clase_id: $c) { token expira_en lista_url } }', { c: lessonId }, student.token);
  const auth = body.data!.autorizar_reproduccion as { token: string; expira_en: number; lista_url: string };
  const issued = Date.now();
  expect(auth.expira_en).toBe(60);

  const list = await get(auth.lista_url, auth.token);
  expect(list.status).toBe(200);
  const urls = list.text.split('\n').filter((l) => l.startsWith('/almacen/'));
  expect(urls).toHaveLength(SEGMENTS.length);
  const served = await fetch(`${STORAGE}${urls[0].replace(/^\/almacen/, '')}`);
  expect(served.status).toBe(200);
  expect(Buffer.from(await served.arrayBuffer()).equals(SEGMENTS[0])).toBe(true); // ahora sirve los bytes
  expect((await get(`/api/v1/reproducciones/${videoId}/clave`, auth.token)).status).toBe(200);

  // Espera REAL hasta ~65 s después de emitir el token (la URL firmada y el token mueren a los 60 s).
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, issued + LIFETIME_MS + 5_000 - Date.now())));

  const expired = await fetch(`${STORAGE}${urls[0].replace(/^\/almacen/, '')}`);
  expect(expired.status).not.toBe(200);
  expect(Buffer.from(await expired.arrayBuffer()).equals(SEGMENTS[0])).toBe(false); // ya no entrega el segmento
  expect((await fetch(`${STORAGE}${urls[1].replace(/^\/almacen/, '')}`)).status).not.toBe(200);
  for (const file of ['lista.m3u8', 'clave']) {
    const r = await get(`/api/v1/reproducciones/${videoId}/${file}`, auth.token);
    expect(r.status).toBe(401);
    expect(r.body.codigo ?? r.body.error?.codigo).toBe('TOKEN_INVALIDO');
  }
});
