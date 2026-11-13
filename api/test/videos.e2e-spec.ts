import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppConfig } from '../src/config/configuration';
import { StorageService } from '../src/modules/storage/services/storage.service';
import { cleanup, newIp, sql } from './helpers/real-env';
import { Account, code, giveRole, GqlBody, newAccount, removeAccountResidue, run, setStatus } from './helpers/school-gql';
import { startSchool } from './helpers/start-school';

// SPEC 10, paso 8: videos (firma REST, `estado_video`, `confirmar_subida_video`, `reintentar_video`, `borrar_video`, webhook
// interno del transcodificador y borrado de archivos). La app corre EN PROCESO (modo desarrollo) contra el stack real (Storage por
// Kong, base `plataforma`), con login real; el transcodificador es un servidor HTTP falso que verifica el contrato y la cabecera
// secreta. Nunca se sube 1 GiB: solo se firma. Cada prueba limpia SU residuo (cursos `zz-e2e-*` y objetos bajo `cursos/<id>/` del
// bucket `videos`); lo copiado de la escuela no se toca.

let app: NestFastifyApplication;
let storage: StorageService;
let secret = '';
const userIds: string[] = [];
const TAG = `${process.pid}`;
const STORAGE = `http://127.0.0.1:${process.env.KONG_HTTP_PORT ?? '8000'}/storage/v1`;
const MAX = 1_073_741_824;
const ID_NONE = 9007199254000;

// --- Transcodificador falso ---

interface Job {
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}
const fake = {
  jobs: [] as Job[],
  mode: 'accept' as 'accept' | 'reject' | 'drop' | 'hang',
  server: undefined as Server | undefined,
  url: '',
  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        if (req.method !== 'POST' || req.url !== '/trabajos') return void res.writeHead(404).end();
        if (req.headers['x-secreto-transcodificador'] !== secret) return void res.writeHead(403).end('{}'); // como el real
        this.jobs.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown> });
        if (this.mode === 'drop') return void req.socket.destroy();
        if (this.mode === 'hang') return;
        if (this.mode === 'reject') return void res.writeHead(500).end('{}');
        res.writeHead(202, { 'Content-Type': 'application/json' }).end('{"estado":"en_cola"}');
      });
    });
    await new Promise<void>((done) => this.server!.listen(0, '127.0.0.1', done));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  },
  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((done) => this.server!.close(() => done()));
  },
};

// --- Consultas ---

const ESTADO = 'query($c: EnteroGrande!) { estado_video(clase_id: $c) { vigente { id estado duracion_segundos listo_en } nuevo { id estado error } } }';
const CONFIRMAR = 'mutation($v: EnteroGrande!) { confirmar_subida_video(video_id: $v) { estado } }';
const REINTENTAR = 'mutation($v: EnteroGrande!) { reintentar_video(video_id: $v) { estado } }';
const BORRAR = 'mutation($c: EnteroGrande!) { borrar_video(clase_id: $c) { ok } }';
const BORRAR_CLASE = 'mutation($c: EnteroGrande!) { borrar_clase(clase_id: $c) { ok } }';
const BORRAR_SECCION = 'mutation($s: EnteroGrande!) { borrar_seccion(seccion_id: $s) { ok } }';

// Todo lo que devuelve la API se guarda: al final se comprueba que ninguna respuesta lleva una clave de cifrado ni el secreto.
const seen: string[] = [];
const keys = new Set<string>();

async function gql(query: string, variables: Record<string, unknown>, token?: string): Promise<GqlBody> {
  const body = await run(app, query, variables, token);
  seen.push(JSON.stringify(body));
  return body;
}
const sign = async (token: string | undefined, body: unknown) => {
  const r = request(app.getHttpServer()).post('/api/v1/videos/firmas').set('X-Forwarded-For', newIp());
  if (token) r.set('Authorization', `Bearer ${token}`);
  const response = await r.send(body as object);
  seen.push(response.text);
  return response;
};
const hook = async (body: unknown, headerSecret?: string | null, token?: string) => {
  const r = request(app.getHttpServer()).post('/api/v1/interno/video-procesado').set('X-Forwarded-For', newIp());
  if (headerSecret) r.set('X-Secreto-Transcodificador', headerSecret);
  if (token) r.set('Authorization', `Bearer ${token}`);
  const response = await r.send(body as object);
  seen.push(response.text);
  return response;
};

// --- Datos de prueba ---

let instructor: Account;
let other: Account;
let plain: Account;
let member: Account;
let before = { courses: 0, videos: 0, keys: 0 };
const pendingCourses: number[] = [];
const allCourses: number[] = [];

interface Fixture {
  courseId: number;
  sectionId: number;
  lessons: number[];
}
function makeCourse(status: 'borrador' | 'en_revision' | 'publicado' = 'borrador', lessonCount = 1): Fixture {
  const courseId = Number(
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, estado) values ('zz-e2e-vid-${TAG}-${allCourses.length}', '${instructor.id}', 'ZZ Video ${TAG}', '${status}') returning id`),
  );
  pendingCourses.push(courseId);
  allCourses.push(courseId);
  const sectionId = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${courseId}, 'Sección', 1) returning id`));
  const lessons: number[] = [];
  for (let i = 1; i <= lessonCount; i++) {
    lessons.push(Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion) values (${sectionId}, 'Clase ${i}', ${i}) returning id`)));
  }
  return { courseId, sectionId, lessons };
}
const reqBody = (lessonId: number, size = 2048, type = 'video/mp4') => ({ clase_id: lessonId, nombre_archivo: 'clase.mp4', tipo_contenido: type, tamano_bytes: size });
const dbVideo = (id: number): string =>
  sql(`select estado || '|' || vigente || '|' || coalesce(duracion_segundos::text, '-') || '|' || coalesce(error, '-') from escuela.videos_clase where id = ${id}`);
const rowCount = (id: number): number => Number(sql(`select count(*) from escuela.videos_clase where id = ${id}`));
const keyCount = (id: number): number => Number(sql(`select count(*) from escuela.claves_video where video_id = ${id}`));
const keyHex = (id: number): string => {
  const hex = sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${id}`);
  keys.add(hex);
  return hex;
};
const age = (id: number, minutes: number): void => void sql(`update escuela.videos_clase set actualizado_en = now() - interval '${minutes} minutes' where id = ${id}`);
const exists = async (path: string): Promise<boolean> => (await storage.getObjectInfo('videos', path)) !== null;

async function put(url: string, size: number, type: string): Promise<number> {
  return (await fetch(`${STORAGE}${url.replace(/^\/almacen/, '')}`, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(Buffer.alloc(size, 7)) })).status;
}
// Archivo suelto en el bucket (simula la salida HLS del transcodificador).
async function putObject(path: string, type: string, size = 64): Promise<void> {
  expect(await put(await storage.signUpload('videos', path), size, type)).toBe(200);
}
const putHls = async (base: string): Promise<void> => {
  await putObject(`${base}/hls/lista.m3u8`, 'application/vnd.apple.mpegurl');
  await putObject(`${base}/hls/segmento_00001.ts`, 'video/mp2t');
};

interface Uploaded {
  videoId: number;
  path: string;
  base: string;
}
// Firma por REST y sube de verdad un archivo pequeño con la URL firmada.
async function upload(lessonId: number, token = instructor.token, size = 2048): Promise<Uploaded> {
  const response = await sign(token, reqBody(lessonId, size));
  expect(response.status).toBe(201);
  expect(await put(response.body.url_subida as string, size, 'video/mp4')).toBe(200);
  const videoId = response.body.video_id as number;
  keyHex(videoId);
  return { videoId, path: response.body.ruta as string, base: (response.body.ruta as string).replace('/original.mp4', '') };
}
async function enqueue(lessonId: number, token = instructor.token): Promise<Uploaded> {
  const video = await upload(lessonId, token);
  const body = await gql(CONFIRMAR, { v: video.videoId }, token);
  expect(body.errors).toBeUndefined();
  return video;
}
// Un video queda vigente como lo deja el transcodificador: archivos HLS en Storage (sin original) y aviso `listo`.
async function makeReady(lessonId: number, duration = 12): Promise<Uploaded> {
  const video = await enqueue(lessonId);
  await putHls(video.base);
  await storage.deleteObject('videos', video.path);
  const response = await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: duration }, secret);
  expect(response.body).toEqual({ aplicado: true });
  return video;
}

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = {
    courses: Number(sql('select count(*) from escuela.cursos')),
    videos: Number(sql('select count(*) from escuela.videos_clase')),
    keys: Number(sql('select count(*) from escuela.claves_video')),
  };
  await fake.start();
  app = await startSchool({ transcoderUrl: fake.url });
  storage = app.get(StorageService, { strict: false });
  secret = app.get(ConfigService).getOrThrow<AppConfig['transcoder']>('transcoder').secret;
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  other = await newAccount(userIds);
  giveRole(other.id, 'instructor');
  plain = await newAccount(userIds);
  member = await newAccount(userIds);
  sql(`insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('${instructor.id}', '${member.id}')`);
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${member.id}', 'equipo_apoyo')`);
});
beforeEach(() => {
  fake.jobs.length = 0;
  fake.mode = 'accept';
});
// Cada prueba limpia SU residuo: objetos de Storage de sus cursos y los cursos (caen secciones, clases, videos y claves).
afterEach(async () => {
  jest.restoreAllMocks();
  for (const id of pendingCourses.splice(0)) {
    await storage.deletePrefix('videos', `cursos/${id}`);
    sql(`delete from escuela.cursos where id = ${id}`);
  }
});
afterAll(async () => {
  await app.close();
  await fake.stop();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(Number(sql('select count(*) from escuela.cursos'))).toBe(before.courses);
  expect(Number(sql('select count(*) from escuela.videos_clase'))).toBe(before.videos); // los videos copiados siguen intactos
  expect(Number(sql('select count(*) from escuela.claves_video'))).toBe(before.keys);
  for (const id of allCourses) expect(await storage.deletePrefix('videos', `cursos/${id}`)).toBe(0); // no quedó ningún objeto
});

describe('firma REST del video', () => {
  it('sin token da 401 TOKEN_INVALIDO', async () => {
    const response = await sign(undefined, reqBody(makeCourse().lessons[0]));
    expect(response.status).toBe(401);
    expect(response.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('sin rol de instructor ni equipo y un instructor ajeno reciben 403 SIN_PERMISO', async () => {
    const { lessons } = makeCourse();
    for (const account of [plain, other]) {
      const response = await sign(account.token, reqBody(lessons[0]));
      expect(response.status).toBe(403);
      expect(response.body.error).toEqual({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' });
    }
    expect(Number(sql(`select count(*) from escuela.videos_clase where clase_id = ${lessons[0]}`))).toBe(0);
  });

  it('el rol se comprueba antes de validar los datos', async () => {
    expect((await sign(plain.token, { clase_id: 0 })).status).toBe(403);
  });

  it('una clase inexistente da 404 NO_ENCONTRADO', async () => {
    const response = await sign(instructor.token, reqBody(ID_NONE));
    expect(response.status).toBe(404);
    expect(response.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un curso en revisión da 409 CURSO_EN_REVISION', async () => {
    const response = await sign(instructor.token, reqBody(makeCourse('en_revision').lessons[0]));
    expect(response.status).toBe(409);
    expect(response.body.error.codigo).toBe('CURSO_EN_REVISION');
  });

  it('el dueño y el equipo reciben 201, también en un curso publicado', async () => {
    for (const status of ['borrador', 'publicado'] as const) {
      const { lessons, courseId } = makeCourse(status, 2);
      expect((await sign(instructor.token, reqBody(lessons[0]))).status).toBe(201);
      expect((await sign(member.token, reqBody(lessons[1]))).status).toBe(201);
      expect(sql(`select estado from escuela.cursos where id = ${courseId}`)).toBe(status); // no cambia el estado del curso
    }
  });

  it('video/avi, 0 y 1 073 741 825 bytes se rechazan', async () => {
    const { lessons } = makeCourse();
    const avi = await sign(instructor.token, reqBody(lessons[0], 100, 'video/avi'));
    expect(avi.status).toBe(422);
    expect(avi.body.error).toEqual({ codigo: 'VIDEO_INVALIDO', mensaje: 'El video debe ser MP4, MOV o WebM.' });
    const zero = await sign(instructor.token, reqBody(lessons[0], 0));
    expect(zero.status).toBe(422);
    expect(zero.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect(zero.body.error.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'tamano_bytes', regla: 'valor_minimo' })]));
    const big = await sign(instructor.token, reqBody(lessons[0], MAX + 1));
    expect(big.status).toBe(422);
    expect(big.body.error).toEqual({ codigo: 'VIDEO_INVALIDO', mensaje: 'El video no puede pesar más de 1 GiB.' });
    expect(Number(sql(`select count(*) from escuela.videos_clase where clase_id = ${lessons[0]}`))).toBe(0);
  });

  it('un campo extra, sin nombre_archivo y datos mal formados dan 422 VALIDACION_FALLIDA', async () => {
    const { lessons } = makeCourse();
    const valid = reqBody(lessons[0]);
    const withoutName: Record<string, unknown> = { ...valid };
    delete withoutName.nombre_archivo;
    const cases: [object, string, string][] = [
      [{ ...valid, extra: 1 }, 'extra', 'campo_no_permitido'],
      [withoutName, 'nombre_archivo', 'obligatorio'],
      [{ ...valid, nombre_archivo: '' }, 'nombre_archivo', 'obligatorio'],
      [{ ...valid, clase_id: 0 }, 'clase_id', 'valor_minimo'],
      [{ ...valid, tamano_bytes: 1_000_000_000_001 }, 'tamano_bytes', 'valor_maximo'],
    ];
    for (const [body, field, rule] of cases) {
      const response = await sign(instructor.token, body);
      expect(response.status).toBe(422);
      expect(response.body.error.codigo).toBe('VALIDACION_FALLIDA');
      expect(response.body.error.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: field, regla: rule })]));
    }
  });

  it('1 073 741 824 bytes con video/mp4 da 201 (solo firma) y crea el registro con su clave de 16 bytes', async () => {
    const { lessons, courseId, sectionId } = makeCourse();
    const response = await sign(instructor.token, reqBody(lessons[0], MAX));
    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(['ruta', 'url_subida', 'video_id']);
    const videoId = response.body.video_id as number;
    const base = `cursos/${courseId}/secciones/${sectionId}/clases/${lessons[0]}/${videoId}`;
    expect(response.body.ruta).toBe(`${base}/original.mp4`);
    expect(response.body.url_subida).toMatch(new RegExp(`^/almacen/object/upload/sign/videos/${base.replaceAll('/', '\\/')}/original\\.mp4\\?token=`));
    expect(sql(`select estado || '|' || ruta_base || '|' || tamano_bytes || '|' || nombre_original || '|' || vigente from escuela.videos_clase where id = ${videoId}`)).toBe(
      `esperando_archivo|${base}|${MAX}|clase.mp4|false`,
    );
    expect(sql(`select octet_length(clave) from escuela.claves_video where video_id = ${videoId}`)).toBe('16');
    expect(response.text).not.toContain(keyHex(videoId));
  });

  it('QuickTime y WebM usan .mov y .webm; cada video tiene su propia clave', async () => {
    const { lessons } = makeCourse('borrador', 2);
    const mov = await sign(instructor.token, reqBody(lessons[0], 10, 'video/quicktime'));
    const webm = await sign(instructor.token, reqBody(lessons[1], 10, 'video/webm'));
    expect(mov.body.ruta).toMatch(/\/original\.mov$/);
    expect(webm.body.ruta).toMatch(/\/original\.webm$/);
    expect(keyHex(mov.body.video_id)).not.toBe(keyHex(webm.body.video_id));
  });

  it('una segunda solicitud sin terminar la primera da 409 VIDEO_EN_PROCESO', async () => {
    const { lessons } = makeCourse();
    expect((await sign(instructor.token, reqBody(lessons[0]))).status).toBe(201);
    const second = await sign(member.token, reqBody(lessons[0]));
    expect(second.status).toBe(409);
    expect(second.body.error).toEqual({ codigo: 'VIDEO_EN_PROCESO', mensaje: 'Esta clase ya tiene un video subiéndose o procesándose.' });
    expect(Number(sql(`select count(*) from escuela.videos_clase where clase_id = ${lessons[0]}`))).toBe(1);
  });
});

describe('confirmar_subida_video', () => {
  it('sin haber subido el archivo da VIDEO_INVALIDO y no cambia el estado', async () => {
    const { lessons } = makeCourse();
    const signed = await sign(instructor.token, reqBody(lessons[0]));
    const body = await gql(CONFIRMAR, { v: signed.body.video_id }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'El video todavía no se subió.', extensions: { codigo: 'VIDEO_INVALIDO' } });
    expect(dbVideo(signed.body.video_id)).toBe('esperando_archivo|false|-|-');
    expect(fake.jobs).toHaveLength(0);
  });

  it('un archivo de otro tamaño o tipo que lo declarado da VIDEO_INVALIDO', async () => {
    const { lessons } = makeCourse('borrador', 2);
    const small = await sign(instructor.token, reqBody(lessons[0], 2048));
    expect(await put(small.body.url_subida, 1024, 'video/mp4')).toBe(200);
    const sizeBody = await gql(CONFIRMAR, { v: small.body.video_id }, instructor.token);
    expect(sizeBody.errors?.[0]).toMatchObject({ message: 'El archivo subido no coincide con lo declarado.', extensions: { codigo: 'VIDEO_INVALIDO' } });
    const typed = await sign(member.token, reqBody(lessons[1], 2048));
    expect(await put(typed.body.url_subida, 2048, 'video/webm')).toBe(200);
    const typeBody = await gql(CONFIRMAR, { v: typed.body.video_id }, member.token);
    expect(typeBody.errors?.[0].extensions.codigo).toBe('VIDEO_INVALIDO');
    expect(fake.jobs).toHaveLength(0);
  });

  it('sube un archivo real, confirma y el transcodificador recibe el contrato con la cabecera secreta', async () => {
    const { lessons, courseId, sectionId } = makeCourse();
    const video = await upload(lessons[0], member.token); // el equipo también sube
    const body = await gql(CONFIRMAR, { v: video.videoId }, member.token);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ confirmar_subida_video: { estado: 'en_cola' } });
    expect(dbVideo(video.videoId)).toBe('en_cola|false|-|-');

    expect(fake.jobs).toHaveLength(1);
    const [job] = fake.jobs;
    expect(job.headers['x-secreto-transcodificador']).toBe(secret);
    expect(job.headers['content-type']).toBe('application/json');
    expect(Object.keys(job.body).sort()).toEqual(['clave_hex', 'ruta_base', 'ruta_original', 'video_id']);
    const base = `cursos/${courseId}/secciones/${sectionId}/clases/${lessons[0]}/${video.videoId}`;
    expect(job.body).toMatchObject({ video_id: video.videoId, ruta_base: base, ruta_original: `${base}/original.mp4` });
    expect(job.body.clave_hex).toMatch(/^[0-9a-f]{32}$/);
    expect(job.body.clave_hex).toBe(keyHex(video.videoId)); // la clave que guarda la base

    const state = await gql(ESTADO, { c: lessons[0] }, instructor.token);
    expect(state.data).toEqual({ estado_video: { vigente: null, nuevo: { id: video.videoId, estado: 'en_cola', error: null } } });
    // confirmar otra vez no lo encola de nuevo
    const again = await gql(CONFIRMAR, { v: video.videoId }, instructor.token);
    expect(again.errors?.[0]).toMatchObject({ message: 'Este video ya se confirmó.', extensions: { codigo: 'ESTADO_INVALIDO' } });
    expect(fake.jobs).toHaveLength(1);
  });

  it('un tipo QuickTime se encola con la extensión .mov', async () => {
    const { lessons } = makeCourse();
    const signed = await sign(instructor.token, reqBody(lessons[0], 512, 'video/quicktime'));
    expect(await put(signed.body.url_subida, 512, 'video/quicktime')).toBe(200);
    expect((await gql(CONFIRMAR, { v: signed.body.video_id }, instructor.token)).errors).toBeUndefined();
    expect(fake.jobs[0].body.ruta_original).toMatch(/\/original\.mov$/);
  });

  it('servicio no disponible: 503 SERVICIO_NO_DISPONIBLE, el video queda en error y se reintenta después', async () => {
    const { lessons } = makeCourse();
    const video = await upload(lessons[0]);
    for (const mode of ['reject', 'drop'] as const) {
      fake.mode = mode;
      const failed = await gql(mode === 'reject' ? CONFIRMAR : REINTENTAR, { v: video.videoId }, instructor.token);
      expect(failed.errors?.[0]).toMatchObject({ message: 'El servicio de video no responde. Inténtalo de nuevo en unos minutos.', extensions: { codigo: 'SERVICIO_NO_DISPONIBLE' } });
      expect(dbVideo(video.videoId)).toBe('error|false|-|El servicio de video no responde. Inténtalo de nuevo.');
    }
    fake.mode = 'accept';
    fake.jobs.length = 0;
    const retried = await gql(REINTENTAR, { v: video.videoId }, instructor.token);
    expect(retried.data).toEqual({ reintentar_video: { estado: 'en_cola' } });
    expect(dbVideo(video.videoId)).toBe('en_cola|false|-|-');
    expect(fake.jobs).toHaveLength(1);
  });

  it('un transcodificador que no contesta a tiempo da 503 y deja el video en error', async () => {
    const { lessons } = makeCourse();
    const video = await upload(lessons[0]);
    fake.mode = 'hang';
    const body = await gql(CONFIRMAR, { v: video.videoId }, instructor.token);
    expect(code(body)).toBe('SERVICIO_NO_DISPONIBLE');
    expect(dbVideo(video.videoId)).toMatch(/^error\|/);
  }, 30_000);
});

describe('permisos y curso en revisión de las operaciones GraphQL', () => {
  it('sin token, sin rol, instructor ajeno y operaciones sobre ids inexistentes', async () => {
    const { lessons } = makeCourse();
    const video = await upload(lessons[0]);
    const ops: [string, Record<string, unknown>][] = [
      [ESTADO, { c: lessons[0] }],
      [CONFIRMAR, { v: video.videoId }],
      [REINTENTAR, { v: video.videoId }],
      [BORRAR, { c: lessons[0] }],
    ];
    for (const [query, variables] of ops) {
      expect(code(await gql(query, variables))).toBe('TOKEN_INVALIDO');
      expect(code(await gql(query, variables, plain.token))).toBe('SIN_PERMISO');
      expect(code(await gql(query, variables, other.token))).toBe('SIN_PERMISO');
    }
    const missing: [string, Record<string, unknown>][] = [
      [ESTADO, { c: ID_NONE }],
      [CONFIRMAR, { v: ID_NONE }],
      [REINTENTAR, { v: ID_NONE }],
      [BORRAR, { c: ID_NONE }],
    ];
    for (const [query, variables] of missing) expect(code(await gql(query, variables, instructor.token))).toBe('NO_ENCONTRADO');
    expect(dbVideo(video.videoId)).toBe('esperando_archivo|false|-|-'); // nada cambió
  });

  it('en un curso en revisión confirmar, reintentar y borrar dan CURSO_EN_REVISION y el estado sí se consulta', async () => {
    const { lessons, courseId } = makeCourse();
    const video = await upload(lessons[0]);
    setStatus(courseId, 'en_revision');
    for (const [query, variables] of [[CONFIRMAR, { v: video.videoId }], [REINTENTAR, { v: video.videoId }], [BORRAR, { c: lessons[0] }]] as [string, Record<string, unknown>][]) {
      const body = await gql(query, variables, instructor.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'El curso está en revisión y no se puede editar.', extensions: { codigo: 'CURSO_EN_REVISION' } });
    }
    expect(dbVideo(video.videoId)).toBe('esperando_archivo|false|-|-');
    expect(fake.jobs).toHaveLength(0);
    expect((await gql(ESTADO, { c: lessons[0] }, instructor.token)).errors).toBeUndefined();
  });

  it('datos mal formados dan VALIDACION_FALLIDA', async () => {
    const body = await gql(CONFIRMAR, { v: 0 }, instructor.token);
    expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'video_id', regla: 'valor_minimo' })]);
  });
});

describe('webhook interno del transcodificador', () => {
  it('sin la cabecera secreta o con una equivocada da 403 SIN_PERMISO y no cambia nada', async () => {
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    const body = { video_id: video.videoId, resultado: 'listo', duracion_segundos: 5 };
    const attempts = [await hook(body), await hook(body, 'x'), await hook(body, `${secret}x`), await hook(body, secret.slice(1)), await hook(body, null, instructor.token)];
    for (const response of attempts) {
      expect(response.status).toBe(403);
      expect(response.body.error).toEqual({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' });
    }
    expect((await hook({ resultado: 'otro' }, 'x')).status).toBe(403); // la cabecera se comprueba antes que el cuerpo
    expect(dbVideo(video.videoId)).toBe('en_cola|false|-|-');
  });

  it('con el secreto, un cuerpo mal formado da 422 VALIDACION_FALLIDA', async () => {
    const cases: [object, string, string][] = [
      [{ resultado: 'listo' }, 'video_id', 'obligatorio'],
      [{ video_id: 1, resultado: 'otro' }, 'resultado', 'valor_no_permitido'],
      [{ video_id: 1, resultado: 'listo', duracion_segundos: 0 }, 'duracion_segundos', 'valor_minimo'],
      [{ video_id: 1, resultado: 'listo', duracion_segundos: 86401 }, 'duracion_segundos', 'valor_maximo'],
      [{ video_id: 1, resultado: 'error', mensaje: 'x'.repeat(501) }, 'mensaje', 'maximo_caracteres'],
      [{ video_id: 1, resultado: 'listo', extra: true }, 'extra', 'campo_no_permitido'],
    ];
    for (const [body, field, rule] of cases) {
      const response = await hook(body, secret);
      expect(response.status).toBe(422);
      expect(response.body.error.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: field, regla: rule })]));
    }
  });

  it('listo marca el video vigente con su duración, no necesita sesión y es idempotente ante reintentos', async () => {
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    await putHls(video.base);
    await storage.deleteObject('videos', video.path); // el transcodificador borra el original
    const first = await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: 252 }, secret);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ aplicado: true });
    expect(dbVideo(video.videoId)).toBe('listo|true|252|-');
    expect(sql(`select listo_en is not null from escuela.videos_clase where id = ${video.videoId}`)).toBe('t');
    // el transcodificador reintenta el aviso (hasta 5 veces): nada cambia y los archivos siguen
    for (let i = 0; i < 2; i++) {
      const again = await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: 999 }, secret);
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ aplicado: false });
    }
    expect((await hook({ video_id: video.videoId, resultado: 'error', mensaje: 'tarde' }, secret)).body).toEqual({ aplicado: false });
    expect(dbVideo(video.videoId)).toBe('listo|true|252|-');
    expect(await exists(`${video.base}/hls/lista.m3u8`)).toBe(true);

    const state = await gql(ESTADO, { c: lessons[0] }, member.token);
    const current = (state.data as { estado_video: { vigente: { id: number; estado: string; duracion_segundos: number; listo_en: string }; nuevo: unknown } }).estado_video;
    expect(current.nuevo).toBeNull();
    expect(current.vigente).toMatchObject({ id: video.videoId, estado: 'listo', duracion_segundos: 252 });
    expect(new Date(current.vigente.listo_en).toISOString()).toBe(current.vigente.listo_en);
  });

  it('si el transcodificador no borró el original, la API lo borra al quedar listo', async () => {
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    await putHls(video.base);
    expect(await exists(video.path)).toBe(true);
    expect((await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: 3 }, secret)).body).toEqual({ aplicado: true });
    expect(await exists(video.path)).toBe(false);
    expect(await exists(`${video.base}/hls/segmento_00001.ts`)).toBe(true);
  });

  it('un video desconocido o borrado entre medias da 200 con aplicado false', async () => {
    expect((await hook({ video_id: ID_NONE, resultado: 'listo', duracion_segundos: 1 }, secret)).body).toEqual({ aplicado: false });
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    expect((await gql(BORRAR, { c: lessons[0] }, instructor.token)).errors).toBeUndefined();
    const response = await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: 9 }, secret);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ aplicado: false });
    expect(rowCount(video.videoId)).toBe(0);
  });

  it('error guarda el mensaje (o el de siempre), conserva el original y el vigente, y reintentar_video lo vuelve a encolar', async () => {
    const { lessons } = makeCourse();
    const ready = await makeReady(lessons[0]);
    const video = await enqueue(lessons[0]);
    expect((await hook({ video_id: video.videoId, resultado: 'error', mensaje: 'El archivo está dañado.' }, secret)).body).toEqual({ aplicado: true });
    expect(dbVideo(video.videoId)).toBe('error|false|-|El archivo está dañado.');
    expect(dbVideo(ready.videoId)).toBe('listo|true|12|-'); // el vigente no se toca
    expect(await exists(video.path)).toBe(true); // el original se conserva
    const state = await gql(ESTADO, { c: lessons[0] }, instructor.token);
    expect(state.data).toMatchObject({ estado_video: { nuevo: { id: video.videoId, estado: 'error', error: 'El archivo está dañado.' }, vigente: { id: ready.videoId } } });

    fake.jobs.length = 0;
    const retried = await gql(REINTENTAR, { v: video.videoId }, member.token);
    expect(retried.data).toEqual({ reintentar_video: { estado: 'en_cola' } });
    expect(dbVideo(video.videoId)).toBe('en_cola|false|-|-');
    expect(fake.jobs).toHaveLength(1);
    expect(fake.jobs[0].body).toMatchObject({ video_id: video.videoId, ruta_original: video.path, clave_hex: keyHex(video.videoId) });

    const wrongState = await gql(REINTENTAR, { v: video.videoId }, instructor.token);
    expect(wrongState.errors?.[0]).toMatchObject({ message: 'Solo se puede reintentar un video con error.', extensions: { codigo: 'ESTADO_INVALIDO' } });
    expect((await hook({ video_id: video.videoId, resultado: 'error' }, secret)).body).toEqual({ aplicado: true });
    expect(dbVideo(video.videoId)).toBe('error|false|-|El video no se pudo procesar.');
  });

  it('un aviso tardío (el transcodificador estuvo colgado) no revive un video que ya estaba en error', async () => {
    const { lessons } = makeCourse();
    fake.mode = 'drop';
    const video = await upload(lessons[0]);
    expect((await gql(CONFIRMAR, { v: video.videoId }, instructor.token)).errors?.[0].extensions.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    expect(dbVideo(video.videoId).startsWith('error|false')).toBe(true);
    const late = await hook({ video_id: video.videoId, resultado: 'listo', duracion_segundos: 7 }, secret);
    expect(late.status).toBe(200);
    expect(late.body).toEqual({ aplicado: false });
    expect(dbVideo(video.videoId).startsWith('error|false')).toBe(true);
  });

  it('reintentar sin el original en Storage da VIDEO_INVALIDO', async () => {
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    await hook({ video_id: video.videoId, resultado: 'error', mensaje: 'x' }, secret);
    await storage.deleteObject('videos', video.path);
    const body = await gql(REINTENTAR, { v: video.videoId }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'El archivo original ya no está: sube el video otra vez.', extensions: { codigo: 'VIDEO_INVALIDO' } });
    expect(dbVideo(video.videoId)).toBe('error|false|-|x');
  });
});

describe('reemplazo de un video', () => {
  it('el anterior sigue vigente hasta que el nuevo está listo y entonces sus archivos desaparecen de Storage', async () => {
    const { lessons } = makeCourse();
    const first = await makeReady(lessons[0], 30);
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(true);

    const second = await enqueue(lessons[0]);
    expect(dbVideo(first.videoId)).toBe('listo|true|30|-');
    const during = await gql(ESTADO, { c: lessons[0] }, instructor.token);
    expect(during.data).toMatchObject({ estado_video: { vigente: { id: first.videoId, estado: 'listo' }, nuevo: { id: second.videoId, estado: 'en_cola' } } });
    expect((await sign(instructor.token, reqBody(lessons[0]))).body.error.codigo).toBe('VIDEO_EN_PROCESO');
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(true);

    await putHls(second.base);
    await storage.deleteObject('videos', second.path);
    expect((await hook({ video_id: second.videoId, resultado: 'listo', duracion_segundos: 45 }, secret)).body).toEqual({ aplicado: true });

    expect(rowCount(first.videoId)).toBe(0);
    expect(keyCount(first.videoId)).toBe(0);
    expect(dbVideo(second.videoId)).toBe('listo|true|45|-');
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${lessons[0]} and vigente`)).toBe('1');
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(false);
    expect(await exists(`${first.base}/hls/segmento_00001.ts`)).toBe(false);
    expect(await exists(`${second.base}/hls/lista.m3u8`)).toBe(true);
    const after = await gql(ESTADO, { c: lessons[0] }, instructor.token);
    expect(after.data).toMatchObject({ estado_video: { vigente: { id: second.videoId, duracion_segundos: 45 }, nuevo: null } });
    // con el reemplazo terminado se puede subir otro
    expect((await sign(instructor.token, reqBody(lessons[0]))).status).toBe(201);
  });

  it('un reemplazo con error no toca al vigente y deja subir otro', async () => {
    const { lessons } = makeCourse();
    const first = await makeReady(lessons[0]);
    const second = await enqueue(lessons[0]);
    await hook({ video_id: second.videoId, resultado: 'error', mensaje: 'dañado' }, secret);
    expect(dbVideo(first.videoId)).toBe('listo|true|12|-');
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(true);
    // con el nuevo en error ya se puede subir otro (el índice de "en proceso" no lo cuenta)
    expect((await sign(instructor.token, reqBody(lessons[0]))).status).toBe(201);
  });
});

describe('tiempo máximo de 45 minutos', () => {
  it('un video en_cola con 46 minutos sin cambios aparece como error; con 44 sigue en cola', async () => {
    const { lessons } = makeCourse('borrador', 2);
    const young = await enqueue(lessons[0]);
    const old = await enqueue(lessons[1]);
    age(young.videoId, 44);
    age(old.videoId, 46);
    const youngState = await gql(ESTADO, { c: lessons[0] }, instructor.token);
    expect(youngState.data).toMatchObject({ estado_video: { nuevo: { estado: 'en_cola', error: null } } });
    const oldState = await gql(ESTADO, { c: lessons[1] }, instructor.token);
    expect(oldState.data).toEqual({ estado_video: { vigente: null, nuevo: { id: old.videoId, estado: 'error', error: 'El procesamiento tardó demasiado.' } } });
    expect(dbVideo(old.videoId)).toBe('error|false|-|El procesamiento tardó demasiado.');
    // el original se conservó: se puede reintentar
    expect((await gql(REINTENTAR, { v: old.videoId }, instructor.token)).data).toEqual({ reintentar_video: { estado: 'en_cola' } });
  });

  it('también cuenta el estado procesando y no afecta a un video listo ni a uno esperando archivo', async () => {
    const { lessons } = makeCourse('borrador', 2);
    const processing = await enqueue(lessons[0]);
    sql(`update escuela.videos_clase set estado = 'procesando' where id = ${processing.videoId}`);
    age(processing.videoId, 50);
    expect((await gql(ESTADO, { c: lessons[0] }, instructor.token)).data).toMatchObject({ estado_video: { nuevo: { estado: 'error', error: 'El procesamiento tardó demasiado.' } } });
    const ready = await makeReady(lessons[1]);
    age(ready.videoId, 600);
    expect((await gql(ESTADO, { c: lessons[1] }, instructor.token)).data).toMatchObject({ estado_video: { vigente: { estado: 'listo' } } });
    const waiting = await sign(instructor.token, reqBody(lessons[1])); // esperando_archivo (sin subir)
    age(waiting.body.video_id, 600);
    expect((await gql(ESTADO, { c: lessons[1] }, instructor.token)).data).toMatchObject({ estado_video: { nuevo: { estado: 'esperando_archivo' } } });
  });
});

describe('borrado de videos y archivos', () => {
  it('borrar_video borra el vigente y el que está en proceso, con filas, claves y archivos, y no toca a un hermano', async () => {
    const { lessons } = makeCourse();
    const first = await makeReady(lessons[0]);
    const second = await enqueue(lessons[0]);
    const sibling = `${second.base}9/otro.ts`; // misma carpeta de clase, otro "video" cuyo id empieza igual
    await putObject(sibling, 'video/mp2t');
    const body = await gql(BORRAR, { c: lessons[0] }, member.token);
    expect(body.data).toEqual({ borrar_video: { ok: true } });
    for (const video of [first, second]) {
      expect(rowCount(video.videoId)).toBe(0);
      expect(keyCount(video.videoId)).toBe(0);
    }
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(false);
    expect(await exists(second.path)).toBe(false);
    expect(await exists(sibling)).toBe(true);
    expect((await gql(ESTADO, { c: lessons[0] }, instructor.token)).data).toEqual({ estado_video: { vigente: null, nuevo: null } });
    const again = await gql(BORRAR, { c: lessons[0] }, instructor.token);
    expect(again.errors?.[0]).toMatchObject({ message: 'El video no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('borrar_video borra también uno con error', async () => {
    const { lessons } = makeCourse();
    const video = await enqueue(lessons[0]);
    await hook({ video_id: video.videoId, resultado: 'error', mensaje: 'x' }, secret);
    expect((await gql(BORRAR, { c: lessons[0] }, instructor.token)).data).toEqual({ borrar_video: { ok: true } });
    expect(rowCount(video.videoId)).toBe(0);
    expect(await exists(video.path)).toBe(false);
  });

  it('borrar_clase borra las filas y los archivos de sus videos', async () => {
    const { lessons, sectionId } = makeCourse('borrador', 2);
    const ready = await makeReady(lessons[0]);
    const processing = await enqueue(lessons[1]);
    expect((await gql(BORRAR_CLASE, { c: lessons[0] }, instructor.token)).data).toEqual({ borrar_clase: { ok: true } });
    expect(rowCount(ready.videoId)).toBe(0);
    expect(keyCount(ready.videoId)).toBe(0);
    expect(await exists(`${ready.base}/hls/lista.m3u8`)).toBe(false);
    expect(dbVideo(processing.videoId)).toBe('en_cola|false|-|-'); // la otra clase no se toca
    expect(await exists(processing.path)).toBe(true);
    expect(sql(`select count(*) from escuela.clases where seccion_id = ${sectionId}`)).toBe('1');
  });

  it('borrar_seccion borra las filas y los archivos de los videos de todas sus clases', async () => {
    const { lessons, sectionId } = makeCourse('borrador', 2);
    const ready = await makeReady(lessons[0]);
    const processing = await enqueue(lessons[1], member.token);
    expect((await gql(BORRAR_SECCION, { s: sectionId }, instructor.token)).data).toEqual({ borrar_seccion: { ok: true } });
    for (const video of [ready, processing]) {
      expect(rowCount(video.videoId)).toBe(0);
      expect(keyCount(video.videoId)).toBe(0);
    }
    expect(await exists(`${ready.base}/hls/lista.m3u8`)).toBe(false);
    expect(await exists(processing.path)).toBe(false);
  });

  it('un fallo de Storage al borrar archivos no deshace el borrado de las filas', async () => {
    const { lessons } = makeCourse();
    const video = await makeReady(lessons[0]);
    jest.spyOn(storage, 'deletePrefix').mockRejectedValue(new Error('Storage caído'));
    expect((await gql(BORRAR, { c: lessons[0] }, instructor.token)).data).toEqual({ borrar_video: { ok: true } });
    expect(rowCount(video.videoId)).toBe(0);
    jest.restoreAllMocks();
    expect(await exists(`${video.base}/hls/lista.m3u8`)).toBe(true); // quedó huérfano; lo limpia afterEach
  });
});

describe('ninguna respuesta filtra la clave ni el secreto', () => {
  it('ni GraphQL, ni REST, ni errores, ni la introspección ni el esquema contienen la clave, clave_hex o el secreto', async () => {
    const introspection = JSON.stringify(await gql('{ __schema { types { name fields { name args { name } } } } }', {}, instructor.token));
    const schemaFile = readFileSync(resolve(__dirname, '../graphql/schema.graphql'), 'utf8');
    expect(introspection).not.toMatch(/clave/i);
    expect(schemaFile).not.toMatch(/^\s*clave\w*\s*[:(]/im); // ningún campo ni argumento (las descripciones sí dicen que no se devuelve)
    expect(keys.size).toBeGreaterThan(5);
    const everything = [...seen, introspection].join('\n');
    for (const key of keys) expect(schemaFile).not.toContain(key);
    for (const key of keys) expect(everything).not.toContain(key);
    expect(everything).not.toContain(secret);
    expect(everything).not.toMatch(/clave_hex/);
  });
});
