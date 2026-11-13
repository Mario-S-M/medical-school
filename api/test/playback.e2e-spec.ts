import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { StorageService } from '../src/modules/storage/services/storage.service';
import { VideoKey } from '../src/modules/videos/entities/video-key.entity';
import { signJwt } from '../src/modules/security/utils/sign-jwt';
import { cleanup, newIp, sql } from './helpers/real-env';
import { Account, addToTeam, code, courseCount, giveRole, GqlBody, newAccount, removeAccountResidue, run } from './helpers/school-gql';
import { readEnv, startSchool } from './helpers/start-school';

// SPEC 12, pasos 1 y 2: `autorizar_reproduccion` (GraphQL), `GET /api/v1/reproducciones/{id}/lista.m3u8` y `.../clave` (REST).
// La app corre EN PROCESO (modo desarrollo) contra el stack real (Storage por Kong, base `plataforma`), con login real. Las
// listas y los segmentos de prueba son objetos reales del bucket privado `videos`. Cada prueba limpia SU residuo: cursos
// `zz-e2e-*`, objetos bajo `cursos/<id>/` del bucket y cuentas.

let app: NestFastifyApplication;
let storage: StorageService;
let appShort: NestFastifyApplication; // vida de la autorización: 60 s
let env: Record<string, string> = {};
const userIds: string[] = [];
const courseIds: number[] = [];
const TAG = `${process.pid}`;
const STORAGE = `http://127.0.0.1:${process.env.KONG_HTTP_PORT ?? '8000'}/storage/v1`;
const ID_NONE = 9007199254000;

const AUTORIZAR = 'mutation($c: EnteroGrande!) { autorizar_reproduccion(clase_id: $c) { video_id token expira_en lista_url duracion_segundos marca_agua } }';
const IV = '0123456789ABCDEF0123456789ABCDEF';
const KEY_LINE = `#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x${IV}`;
const SEGMENTS = [Buffer.from('segmento uno 1111'), Buffer.from('segmento dos 22'), Buffer.from('segmento tres 333333')];

let instructor: Account;
let other: Account;
let plain: Account;
let member: Account;
let admin: Account;
let before = 0;

// Todo lo que devuelve la API se guarda: al final se comprueba que solo `GET .../clave` entrega la clave.
const seen: string[] = [];
const keys = new Set<string>();

async function gql(query: string, variables: Record<string, unknown>, token?: string, target: NestFastifyApplication = app): Promise<GqlBody> {
  const body = await run(target, query, variables, token);
  seen.push(JSON.stringify(body));
  return body;
}

interface Fixture {
  courseId: number;
  sectionId: number;
}
function makeCourse(status: 'borrador' | 'publicado'): Fixture {
  const courseId = Number(
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, estado) values ('zz-e2e-rep-${TAG}-${courseIds.length}', '${instructor.id}', 'ZZ Reproduccion ${TAG}', '${status}') returning id`),
  );
  courseIds.push(courseId);
  const sectionId = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${courseId}, 'Sección', 1) returning id`));
  return { courseId, sectionId };
}
let lessonPosition = 0;
function makeLesson(fixture: Fixture, sample: boolean): number {
  return Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion, es_muestra) values (${fixture.sectionId}, 'Clase', ${++lessonPosition}, ${sample}) returning id`));
}

interface Video {
  id: number;
  basePath: string;
  keyHex: string;
}
function makeVideo(fixture: Fixture, lessonId: number, status: 'listo' | 'en_cola' | 'error' = 'listo', current = status === 'listo'): Video {
  const basePath = `cursos/${fixture.courseId}/secciones/${fixture.sectionId}/clases/${lessonId}/videos/e2e-${TAG}-${lessonId}`;
  const id = Number(
    sql(
      `insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base, listo_en)
       values (${lessonId}, '${status}', ${current}, 'clase.mp4', 'video/mp4', 1000, 125, '${basePath}', ${status === 'listo' ? 'now()' : 'null'}) returning id`,
    ),
  );
  const keyHex = randomBytes(16).toString('hex');
  sql(`insert into escuela.claves_video (video_id, clave) values (${id}, decode('${keyHex}', 'hex'))`);
  keys.add(keyHex);
  return { id, basePath, keyHex };
}

async function putObject(path: string, body: Buffer, type: string): Promise<void> {
  const url = await storage.signUpload('videos', path);
  const response = await fetch(`${STORAGE}${url}`, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(body) });
  expect(response.status).toBe(200);
}
const playlistText = (lines: string[]): string => ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', '#EXT-X-MEDIA-SEQUENCE:1', '#EXT-X-PLAYLIST-TYPE:VOD', KEY_LINE, ...lines, '#EXT-X-ENDLIST', ''].join('\n');
const goodLines = SEGMENTS.flatMap((_, i) => ['#EXTINF:6.000000,', `segmento_${String(i + 1).padStart(5, '0')}.ts`]);
async function uploadPlaylist(video: Video, text: string, segments = SEGMENTS): Promise<void> {
  await putObject(`${video.basePath}/hls/lista.m3u8`, Buffer.from(text), 'application/vnd.apple.mpegurl');
  for (const [i, bytes] of segments.entries()) await putObject(`${video.basePath}/hls/segmento_${String(i + 1).padStart(5, '0')}.ts`, bytes, 'video/mp2t');
}

function get(path: string, token?: string, ip = newIp(), target: NestFastifyApplication = app) {
  const r = request(target.getHttpServer()).get(path).set('X-Forwarded-For', ip);
  if (token) r.set('Authorization', `Bearer ${token}`);
  return r;
}
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const urlOf = (video: Video, file: string): string => `/api/v1/reproducciones/${video.id}/${file}`;

async function authorize(account: Account, lessonId: number): Promise<{ token: string; videoId: number; body: GqlBody }> {
  const body = await gql(AUTORIZAR, { c: lessonId }, account.token);
  const data = body.data?.autorizar_reproduccion as { token: string; video_id: number } | null | undefined;
  return { token: data?.token ?? '', videoId: data?.video_id ?? 0, body };
}
const claims = (token: string): Record<string, unknown> => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

// Cursos y clases de la matriz de permisos.
let published: Fixture;
let draft: Fixture;
let sampleLesson: number;
let normalLesson: number;
let draftSample: number;
let draftNormal: number;
let noVideoLesson: number;
let queuedLesson: number;
let errorLesson: number;
let main: Video; // con lista y segmentos reales en Storage
let normalVideo: Video;

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = courseCount();
  env = readEnv();
  app = await startSchool();
  appShort = await startSchool({ playbackSeconds: 60 });
  storage = app.get(StorageService, { strict: false });
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  other = await newAccount(userIds);
  giveRole(other.id, 'instructor');
  plain = await newAccount(userIds);
  member = await newAccount(userIds);
  addToTeam(instructor.id, member.id);
  admin = await newAccount(userIds);
  giveRole(admin.id, 'administrador');

  published = makeCourse('publicado');
  draft = makeCourse('borrador');
  sampleLesson = makeLesson(published, true);
  normalLesson = makeLesson(published, false);
  draftSample = makeLesson(draft, true);
  draftNormal = makeLesson(draft, false);
  noVideoLesson = makeLesson(published, true);
  queuedLesson = makeLesson(published, true);
  errorLesson = makeLesson(published, true);
  main = makeVideo(published, sampleLesson);
  normalVideo = makeVideo(published, normalLesson);
  makeVideo(draft, draftSample);
  makeVideo(draft, draftNormal);
  makeVideo(published, queuedLesson, 'en_cola');
  makeVideo(published, errorLesson, 'error');
  await uploadPlaylist(main, playlistText(goodLines));
});
afterAll(async () => {
  for (const id of courseIds) await storage.deletePrefix('videos', `cursos/${id}`);
  await appShort.close();
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before);
  expect(Number(sql(`select count(*) from escuela.videos_clase where nombre_original = 'clase.mp4' and ruta_base like '%/videos/e2e-${TAG}-%'`))).toBe(0);
});

describe('autorizar_reproduccion: matriz de permisos', () => {
  it('sin sesión da TOKEN_INVALIDO', async () => {
    expect(code(await gql(AUTORIZAR, { c: sampleLesson }))).toBe('TOKEN_INVALIDO');
    expect(code(await gql(AUTORIZAR, { c: sampleLesson }, 'abc.def.ghi'))).toBe('TOKEN_INVALIDO');
  });

  it('una clase muestra de un curso publicado da token a cualquier cuenta, con los campos del contrato', async () => {
    for (const account of [plain, other, instructor, member, admin]) {
      const { body, token } = await authorize(account, sampleLesson);
      expect(body.errors).toBeUndefined();
      const data = body.data?.autorizar_reproduccion as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(['duracion_segundos', 'expira_en', 'lista_url', 'marca_agua', 'token', 'video_id']);
      expect(data.video_id).toBe(main.id);
      expect(data.lista_url).toBe(`/api/v1/reproducciones/${main.id}/lista.m3u8`);
      expect(data.duracion_segundos).toBe(125);
      expect(data.marca_agua).toBe(account.person.correo);
      expect(Math.abs((data.expira_en as number) - 600)).toBeLessThanOrEqual(2);
      const payload = claims(token);
      expect(payload).toMatchObject({ iss: env.API_EXTERNAL_URL, aud: 'reproduccion', sub: account.id, vid: main.id, cid: sampleLesson });
      expect((payload.exp as number) - (payload.iat as number)).toBe(600);
    }
  });

  it('una clase que no es muestra da SIN_PERMISO a una cuenta cualquiera y a otro instructor', async () => {
    for (const account of [plain, other]) {
      const { body } = await authorize(account, normalLesson);
      expect(code(body)).toBe('SIN_PERMISO');
      expect(body.errors?.[0].message).toBe('No tienes permiso para hacer esto.');
      expect(body.data).toBeNull();
    }
  });

  it('el dueño, el equipo y el administrador reciben token para cualquier clase, incluso con el curso en borrador', async () => {
    for (const account of [instructor, member, admin]) {
      for (const lesson of [normalLesson, draftSample, draftNormal]) {
        const { body, token } = await authorize(account, lesson);
        expect(body.errors).toBeUndefined();
        expect(claims(token).sub).toBe(account.id);
      }
    }
  });

  it('una muestra de un curso en borrador da SIN_PERMISO a un estudiante', async () => {
    expect(code((await authorize(plain, draftSample)).body)).toBe('SIN_PERMISO');
    expect(code((await authorize(other, draftSample)).body)).toBe('SIN_PERMISO');
  });

  it('una clase inexistente da NO_ENCONTRADO', async () => {
    for (const account of [plain, admin]) expect(code((await authorize(account, ID_NONE)).body)).toBe('NO_ENCONTRADO');
  });

  it('sin video vigente y listo (ninguno, en cola o con error) da VIDEO_NO_DISPONIBLE a quien sí tiene permiso', async () => {
    for (const lesson of [noVideoLesson, queuedLesson, errorLesson]) {
      for (const account of [plain, instructor]) {
        const { body } = await authorize(account, lesson);
        expect(code(body)).toBe('VIDEO_NO_DISPONIBLE');
        expect(body.errors?.[0].message).toBe('El video de esta clase todavía no está listo.');
      }
    }
  });

  it('un clase_id mal formado da VALIDACION_FALLIDA', async () => {
    expect(code(await gql(AUTORIZAR, { c: 0 }, plain.token))).toBe('VALIDACION_FALLIDA');
  });

  it('SEGUNDOS_AUTORIZACION_REPRODUCCION fija la vida: con 60 s, expira_en = 60 y exp = iat + 60', async () => {
    const body = await gql(AUTORIZAR, { c: sampleLesson }, plain.token, appShort);
    const data = body.data?.autorizar_reproduccion as { expira_en: number; token: string };
    expect(data.expira_en).toBe(60);
    expect((claims(data.token).exp as number) - (claims(data.token).iat as number)).toBe(60);
  });
});

describe('token de reproducción: audiencia, caducidad y video', () => {
  it('el token de acceso en lista y clave da 401 TOKEN_INVALIDO', async () => {
    for (const file of ['lista.m3u8', 'clave']) {
      const response = await get(urlOf(main, file), plain.token).expect(401);
      expect(response.body.error.codigo).toBe('TOKEN_INVALIDO');
    }
  });

  it('el token de reproducción no sirve en GraphQL (TOKEN_INVALIDO)', async () => {
    const { token } = await authorize(plain, sampleLesson);
    expect(code(await gql(AUTORIZAR, { c: sampleLesson }, token))).toBe('TOKEN_INVALIDO');
    expect(code(await gql('query { yo { id } }', {}, token))).toBe('TOKEN_INVALIDO');
  });

  it('sin token, con un token roto o con otra firma da 401 TOKEN_INVALIDO y ningún byte de la clave', async () => {
    const { token } = await authorize(plain, sampleLesson);
    const forged = signJwt(claims(token), 'otra-clave-otra-clave-otra-clave');
    for (const file of ['lista.m3u8', 'clave']) {
      for (const bearer of [undefined, 'abc', 'abc.def.ghi', forged]) {
        const response = await get(urlOf(main, file), bearer).expect(401);
        expect(response.headers['content-type']).toMatch(/^application\/json/);
        expect(response.body).toEqual({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token de acceso falta, no es válido o expiró.' } });
        expect(JSON.stringify(response.body)).not.toContain(main.keyHex);
      }
    }
  });

  it('un token caducado da 401 TOKEN_INVALIDO', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = signJwt(
      { iss: env.API_EXTERNAL_URL, aud: 'reproduccion', sub: plain.id, vid: main.id, cid: sampleLesson, iat: now - 700, exp: now - 100 },
      env.JWT_SECRET,
    );
    const valid = signJwt({ iss: env.API_EXTERNAL_URL, aud: 'reproduccion', sub: plain.id, vid: main.id, cid: sampleLesson, iat: now, exp: now + 60 }, env.JWT_SECRET);
    for (const file of ['lista.m3u8', 'clave']) {
      expect((await get(urlOf(main, file), expired).expect(401)).body.error.codigo).toBe('TOKEN_INVALIDO');
    }
    await get(urlOf(main, 'clave'), valid).expect(200); // el mismo token, vigente, sí sirve
  });

  it('el token de otro video da 403 SIN_PERMISO', async () => {
    const { token } = await authorize(plain, sampleLesson);
    for (const file of ['lista.m3u8', 'clave']) {
      const response = await get(`/api/v1/reproducciones/${normalVideo.id}/${file}`, token).expect(403);
      expect(response.body.error).toEqual({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' });
    }
  });

  it('un video que ya no es vigente o no está listo da 404 NO_ENCONTRADO', async () => {
    const lesson = makeLesson(published, true);
    const video = makeVideo(published, lesson);
    const { token } = await authorize(plain, lesson);
    await get(urlOf(video, 'clave'), token).expect(200);
    sql(`update escuela.videos_clase set vigente = false where id = ${video.id}`);
    for (const file of ['lista.m3u8', 'clave']) {
      const response = await get(urlOf(video, file), token).expect(404);
      expect(response.body.error.codigo).toBe('NO_ENCONTRADO');
    }
    sql(`update escuela.videos_clase set vigente = true, estado = 'procesando' where id = ${video.id}`);
    await get(urlOf(video, 'clave'), token).expect(404);
    sql(`delete from escuela.videos_clase where id = ${video.id}`);
    await get(urlOf(video, 'clave'), token).expect(404);
  });
});

describe('GET lista.m3u8', () => {
  it('devuelve la lista con el #EXT-X-KEY intacto y cada segmento como URL firmada de Storage', async () => {
    const { token } = await authorize(plain, sampleLesson);
    const response = await get(urlOf(main, 'lista.m3u8'), token).expect(200);
    expect(response.headers['content-type']).toBe('application/vnd.apple.mpegurl');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const lines = response.text.split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(lines).toContain(KEY_LINE);
    expect(response.text).toContain('METHOD=AES-128');
    expect(response.text).toContain(`IV=0x${IV}`);
    expect(response.text).not.toMatch(/^segmento_\d{5}\.ts$/m);
    expect(lines.filter((l) => l.startsWith('#EXTINF'))).toHaveLength(3);
    const signed = lines.filter((l) => !l.startsWith('#') && l !== '');
    expect(signed).toHaveLength(3);
    signed.forEach((line, i) => {
      expect(line).toMatch(new RegExp(`^/almacen/object/sign/videos/${main.basePath}/hls/segmento_0000${i + 1}\\.ts\\?token=[A-Za-z0-9._-]+$`));
    });
    // El token de reproducción no viaja en las URL de Storage.
    expect(response.text).not.toContain(token);
  });

  it('el URI="clave" resuelve, relativo a la ruta de la lista, a la ruta de la clave', async () => {
    const { token } = await authorize(plain, sampleLesson);
    const text = (await get(urlOf(main, 'lista.m3u8'), token).expect(200)).text;
    const uri = /URI="([^"]+)"/.exec(text)?.[1] ?? '';
    expect(new URL(uri, `http://api.test${urlOf(main, 'lista.m3u8')}`).pathname).toBe(urlOf(main, 'clave'));
  });

  it('cada URL firmada devuelve los bytes de su segmento (por Kong/Storage, sin sesión) y la de otro objeto no sirve', async () => {
    const { token } = await authorize(plain, sampleLesson);
    const text = (await get(urlOf(main, 'lista.m3u8'), token).expect(200)).text;
    const signed = text.split('\n').filter((l) => l.startsWith('/almacen/'));
    for (const [i, url] of signed.entries()) {
      const response = await fetch(`${STORAGE}${url.replace(/^\/almacen/, '')}`);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(SEGMENTS[i]);
    }
    // El token de una firma no vale para otra ruta.
    const swapped = signed[0].replace('segmento_00001', 'segmento_00002');
    expect((await fetch(`${STORAGE}${swapped.replace(/^\/almacen/, '')}`)).status).not.toBe(200);
  });

  it('firma todos los segmentos en UNA sola llamada por lotes', async () => {
    const spy = jest.spyOn(storage, 'signDownloads');
    const { token } = await authorize(plain, sampleLesson);
    await get(urlOf(main, 'lista.m3u8'), token).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual([1, 2, 3].map((n) => `${main.basePath}/hls/segmento_0000${n}.ts`));
    expect(spy.mock.calls[0][2]).toBe(600);
    spy.mockRestore();
  });

  it('una línea con una ruta rara NO se firma: la lista se rechaza con 500 ERROR_INTERNO', async () => {
    for (const rare of ['../x.ts', 'otra/segmento_00001.ts', 'segmento_1.ts', 'https://evil.example/a.ts']) {
      const lesson = makeLesson(published, true);
      const video = makeVideo(published, lesson);
      await uploadPlaylist(video, playlistText(['#EXTINF:6.000000,', 'segmento_00001.ts', '#EXTINF:6.000000,', rare]), [SEGMENTS[0]]);
      const spy = jest.spyOn(storage, 'signDownloads');
      const { token } = await authorize(plain, lesson);
      const response = await get(urlOf(video, 'lista.m3u8'), token).expect(500);
      expect(response.body.error).toEqual({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('un video listo sin su lista, o con un segmento que falta, da 500 ERROR_INTERNO sin filtrar nada', async () => {
    const lesson = makeLesson(published, true);
    const video = makeVideo(published, lesson);
    const { token } = await authorize(plain, lesson);
    const noList = await get(urlOf(video, 'lista.m3u8'), token).expect(500);
    expect(noList.body.error.codigo).toBe('ERROR_INTERNO');
    await uploadPlaylist(video, playlistText(goodLines), [SEGMENTS[0]]); // faltan los segmentos 2 y 3
    const missing = await get(urlOf(video, 'lista.m3u8'), token).expect(500);
    expect(missing.body).toEqual({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' } });
    expect(JSON.stringify(missing.body)).not.toContain(video.basePath);
  });
});

describe('GET clave', () => {
  it('devuelve exactamente los 16 bytes de claves_video con application/octet-stream y no-store', async () => {
    const { token } = await authorize(plain, sampleLesson);
    const response = await get(urlOf(main, 'clave'), token).buffer(true).parse(binary).expect(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const body = response.body as Buffer;
    expect(body).toHaveLength(16);
    expect(body.toString('hex')).toBe(sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${main.id}`));
    expect(body.toString('hex')).toBe(main.keyHex);
  });

  it('la columna de la clave sigue con select: false y GraphQL no tiene ningún campo de clave', async () => {
    const column = app.get(DataSource).getRepository(VideoKey).metadata.findColumnWithPropertyName('key');
    expect(column?.isSelect).toBe(false);
    const body = await gql('{ __schema { types { name fields { name args { name } } inputFields { name } } } }', {});
    const names = JSON.stringify(
      (body.data as { __schema: { types: { name: string; fields: { name: string; args: { name: string }[] }[] | null; inputFields: { name: string }[] | null }[] } }).__schema.types.flatMap((t) => [
        t.name,
        ...(t.fields ?? []).flatMap((f) => [f.name, ...f.args.map((a) => a.name)]),
        ...(t.inputFields ?? []).map((f) => f.name),
      ]),
    );
    expect(names).not.toMatch(/clave/i);
    expect(names).toContain('autorizar_reproduccion');
  });
});

describe('capa transversal en las rutas de reproducción', () => {
  it('otros métodos dan 405 METODO_NO_PERMITIDO con Allow: GET y una ruta inexistente 404 NO_ENCONTRADO', async () => {
    for (const file of ['lista.m3u8', 'clave']) {
      const response = await request(app.getHttpServer()).post(urlOf(main, file)).set('X-Forwarded-For', newIp()).send({}).expect(405);
      expect(response.body.error.codigo).toBe('METODO_NO_PERMITIDO');
      expect(response.headers.allow).toContain('GET');
    }
    const missing = await get(`/api/v1/reproducciones/${main.id}/otra`).expect(404);
    expect(missing.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('la petición 121 de una misma IP en un minuto da 429 con Retry-After (las respuestas 401 también cuentan)', async () => {
    const ip = newIp();
    // El contador de la capa transversal es por ruta e IP (cada manejador lleva el suyo): 120 en `clave` y la 121 se limita.
    for (let i = 0; i < 120; i++) await get(urlOf(main, 'clave'), undefined, ip).expect(401);
    const limited = await get(urlOf(main, 'clave'), undefined, ip).expect(429);
    expect(limited.body.error.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await get(urlOf(main, 'lista.m3u8'), undefined, ip).expect(401); // la lista lleva su propio contador
    await get(urlOf(main, 'clave'), undefined, newIp()).expect(401); // otra IP no se ve afectada
  });
});

describe('la clave solo sale por GET .../clave', () => {
  it('ninguna respuesta de GraphQL ni de error contiene la clave ni claves_video', () => {
    expect(keys.size).toBeGreaterThan(0);
    const all = seen.join('\n').toLowerCase();
    expect(all).not.toContain('clave_hex');
    expect(all).not.toMatch(/"clave"\s*:/);
    for (const hex of keys) expect(all).not.toContain(hex);
  });
});
