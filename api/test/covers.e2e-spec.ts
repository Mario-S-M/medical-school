import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { StorageService } from '../src/modules/storage/services/storage.service';
import { cleanup, newIp, sql } from './helpers/real-env';
import { Account, code, courseCount, giveRole, GqlBody, newAccount, removeAccountResidue, run, setStatus } from './helpers/school-gql';
import { startSchool } from './helpers/start-school';

// SPEC 10, paso 6: portadas (firma REST `POST /api/v1/portadas/firmas` y `confirmar_portada`). La app corre EN PROCESO (modo
// desarrollo) contra el stack real (Storage por Kong, base `plataforma`), con login real. Cada prueba limpia su residuo:
// cursos `zz-e2e-*`, objetos bajo `cursos/<id>/` del bucket y cuentas; lo copiado de la escuela no se toca.

let app: NestFastifyApplication;
let storage: StorageService;
const userIds: string[] = [];
const courseIds: number[] = [];
const TAG = `${process.pid}`;
const STORAGE = `http://127.0.0.1:${process.env.KONG_HTTP_PORT ?? '8000'}/storage/v1`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const CONFIRMAR = 'mutation($c: EnteroGrande!, $r: String!) { confirmar_portada(curso_id: $c, ruta: $r) { portada_url } }';

let instructor: Account;
let other: Account;
let plain: Account;
let member: Account;
let before = 0;

function insertCourse(key: string, status: 'borrador' | 'en_revision' = 'borrador'): number {
  const id = Number(
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, estado) values ('zz-e2e-cov-${key}-${TAG}', '${instructor.id}', 'ZZ Portada ${key} ${TAG}', '${status}') returning id`),
  );
  courseIds.push(id);
  return id;
}

const sign = (token: string | undefined, body: unknown) => {
  const r = request(app.getHttpServer()).post('/api/v1/portadas/firmas').set('X-Forwarded-For', newIp());
  if (token) r.set('Authorization', `Bearer ${token}`);
  return r.send(body as object);
};
const png = (courseId: number, size = PNG.length) => ({ curso_id: courseId, tipo_contenido: 'image/png', tamano_bytes: size });

// Sube el PNG con la URL firmada que devolvió la API (el navegador la pide bajo /almacen, que el proxy lleva a Storage).
async function upload(urlSubida: string, body: Buffer = PNG, type = 'image/png'): Promise<number> {
  return (await fetch(`${STORAGE}${urlSubida.replace(/^\/almacen/, '')}`, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(body) })).status;
}
async function signAndUpload(token: string, courseId: number): Promise<string> {
  const response = await sign(token, png(courseId)).expect(201);
  expect(await upload(response.body.url_subida)).toBe(200);
  return response.body.ruta as string;
}
const publicStatus = async (path: string): Promise<number> => (await fetch(`${STORAGE}/object/public/portadas/${path}`)).status; // sin sesión
const dbPath = (id: number): string => sql(`select coalesce(portada_ruta, '<null>') from escuela.cursos where id = ${id}`);
const message = (body: GqlBody): string | undefined => body.errors?.[0]?.message;

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = courseCount();
  app = await startSchool();
  storage = app.get(StorageService, { strict: false });
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  other = await newAccount(userIds);
  giveRole(other.id, 'instructor');
  plain = await newAccount(userIds);
  member = await newAccount(userIds);
  sql(`insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('${instructor.id}', '${member.id}')`);
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${member.id}', 'equipo_apoyo')`);
});
afterAll(async () => {
  for (const id of courseIds) await storage.deletePrefix('portadas', `cursos/${id}`);
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before); // no queda ningún curso de prueba y los datos copiados siguen intactos
});

describe('firma REST de la portada', () => {
  it('sin token da 401 TOKEN_INVALIDO', async () => {
    const response = await sign(undefined, png(insertCourse('sintoken'))).expect(401);
    expect(response.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('sin rol de instructor, el equipo de apoyo y otro instructor reciben 403 SIN_PERMISO', async () => {
    const id = insertCourse('permisos');
    for (const account of [plain, member, other]) {
      const response = await sign(account.token, png(id)).expect(403);
      expect(response.body.error).toEqual({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' });
    }
  });

  it('el rol se comprueba antes de validar los datos', async () => {
    await sign(plain.token, { curso_id: 0 }).expect(403);
  });

  it('un curso inexistente da 404 NO_ENCONTRADO', async () => {
    const response = await sign(instructor.token, png(9007199254000)).expect(404);
    expect(response.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El curso no existe.' });
  });

  it('un curso en revisión da 409 CURSO_EN_REVISION', async () => {
    const id = insertCourse('revision', 'en_revision');
    const response = await sign(instructor.token, png(id)).expect(409);
    expect(response.body.error.codigo).toBe('CURSO_EN_REVISION');
  });

  it('image/gif da 422 PORTADA_INVALIDA', async () => {
    const response = await sign(instructor.token, { ...png(insertCourse('gif')), tipo_contenido: 'image/gif' }).expect(422);
    expect(response.body.error).toEqual({ codigo: 'PORTADA_INVALIDA', mensaje: 'La portada debe ser una imagen JPG, PNG o WebP.' });
  });

  it('más de 2 097 152 bytes da 422 PORTADA_INVALIDA y exactamente 2 097 152 da 201', async () => {
    const id = insertCourse('tamano');
    const big = await sign(instructor.token, png(id, 2_097_153)).expect(422);
    expect(big.body.error).toEqual({ codigo: 'PORTADA_INVALIDA', mensaje: 'La portada no puede pesar más de 2 MB.' });
    await sign(instructor.token, png(id, 2_097_152)).expect(201);
  });

  it('datos mal formados dan 422 VALIDACION_FALLIDA con el campo y la regla', async () => {
    const id = insertCourse('validacion');
    const cases: [object, string, string][] = [
      [{ curso_id: id, tipo_contenido: 'image/png' }, 'tamano_bytes', 'obligatorio'],
      [{ ...png(id), tamano_bytes: 0 }, 'tamano_bytes', 'valor_minimo'],
      [{ ...png(id), tamano_bytes: 1_000_000_001 }, 'tamano_bytes', 'valor_maximo'],
      [{ ...png(id), tipo_contenido: '' }, 'tipo_contenido', 'obligatorio'],
      [{ ...png(id), curso_id: 0 }, 'curso_id', 'valor_minimo'],
      [{ ...png(id), extra: 1 }, 'extra', 'campo_no_permitido'],
    ];
    for (const [body, field, rule] of cases) {
      const response = await sign(instructor.token, body).expect(422);
      expect(response.body.error.codigo).toBe('VALIDACION_FALLIDA');
      expect(response.body.error.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: field, regla: rule })]));
    }
  });

  it('un PNG válido da 201 con la URL firmada bajo /almacen y la ruta del curso', async () => {
    const id = insertCourse('forma');
    const response = await sign(instructor.token, png(id)).expect(201);
    expect(Object.keys(response.body).sort()).toEqual(['ruta', 'url_subida']);
    expect(response.body.ruta).toMatch(new RegExp(`^cursos/${id}/portada-[0-9a-f]{32}\\.png$`));
    expect(response.body.url_subida).toMatch(new RegExp(`^/almacen/object/upload/sign/portadas/${response.body.ruta.replaceAll('.', '\\.')}\\?token=`));
  });

  it('JPG y WebP también se firman con su extensión', async () => {
    const id = insertCourse('ext');
    for (const [type, ext] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
      const response = await sign(instructor.token, { ...png(id), tipo_contenido: type }).expect(201);
      expect(response.body.ruta).toMatch(new RegExp(`\\.${ext}$`));
    }
  });
});

describe('confirmar_portada', () => {
  it('sube un PNG real con la URL firmada, lo confirma, queda público sin sesión y borra la anterior', async () => {
    const id = insertCourse('flujo');
    const first = await signAndUpload(instructor.token, id);
    const confirmed = await run(app, CONFIRMAR, { c: id, r: first }, instructor.token);
    expect(confirmed.errors).toBeUndefined();
    expect(confirmed.data).toEqual({ confirmar_portada: { portada_url: `/almacen/object/public/portadas/${first}` } });
    expect(dbPath(id)).toBe(first);
    const publicResponse = await fetch(`${STORAGE}/object/public/portadas/${first}`); // sin Authorization
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('content-type')).toBe('image/png');

    const second = await signAndUpload(instructor.token, id);
    expect(second).not.toBe(first);
    expect((await run(app, CONFIRMAR, { c: id, r: second }, instructor.token)).errors).toBeUndefined();
    expect(dbPath(id)).toBe(second);
    expect(await publicStatus(second)).toBe(200);
    expect(await publicStatus(first)).not.toBe(200); // la anterior ya no está en el bucket
  });

  it('confirmar otra vez la misma ruta no la borra', async () => {
    const id = insertCourse('repetida');
    const path = await signAndUpload(instructor.token, id);
    await run(app, CONFIRMAR, { c: id, r: path }, instructor.token);
    expect((await run(app, CONFIRMAR, { c: id, r: path }, instructor.token)).errors).toBeUndefined();
    expect(await publicStatus(path)).toBe(200);
  });

  it('sin haber subido el archivo da PORTADA_INVALIDA y no cambia el curso', async () => {
    const id = insertCourse('sinsubir');
    const response = await sign(instructor.token, png(id)).expect(201);
    const body = await run(app, CONFIRMAR, { c: id, r: response.body.ruta }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La portada todavía no se subió.', extensions: { codigo: 'PORTADA_INVALIDA' } });
    expect(dbPath(id)).toBe('<null>');
  });

  it('una ruta de otro curso o con otra forma se rechaza antes de mirar Storage', async () => {
    const id = insertCourse('ruta');
    const otherCourse = insertCourse('ruta-otro');
    const foreign = await signAndUpload(instructor.token, otherCourse); // objeto real, pero de otro curso
    for (const path of [foreign, `cursos/${id}/portada-0123.png`, `cursos/${id}/../${otherCourse}/x.png`, `cursos/${id}/portada-${'a'.repeat(32)}.gif`]) {
      const body = await run(app, CONFIRMAR, { c: id, r: path }, instructor.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'La ruta de la portada no corresponde a este curso.', extensions: { codigo: 'PORTADA_INVALIDA' } });
    }
    expect(dbPath(id)).toBe('<null>');
    expect(dbPath(otherCourse)).toBe('<null>');
  });

  it('sin token, sin rol de instructor, el equipo y otro instructor no confirman', async () => {
    const id = insertCourse('permiso');
    const path = await signAndUpload(instructor.token, id);
    expect(code(await run(app, CONFIRMAR, { c: id, r: path }))).toBe('TOKEN_INVALIDO');
    for (const account of [plain, member, other]) expect(code(await run(app, CONFIRMAR, { c: id, r: path }, account.token))).toBe('SIN_PERMISO');
    expect(dbPath(id)).toBe('<null>');
  });

  it('un curso en revisión da CURSO_EN_REVISION y uno inexistente NO_ENCONTRADO', async () => {
    const id = insertCourse('revision-conf');
    const path = await signAndUpload(instructor.token, id);
    setStatus(id, 'en_revision');
    const body = await run(app, CONFIRMAR, { c: id, r: path }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'El curso está en revisión y no se puede editar.', extensions: { codigo: 'CURSO_EN_REVISION' } });
    expect(message(await run(app, CONFIRMAR, { c: 9007199254000, r: path }, instructor.token))).toBe('El curso no existe.');
  });

  it('datos mal formados dan VALIDACION_FALLIDA', async () => {
    const id = insertCourse('valida-conf');
    const body = await run(app, CONFIRMAR, { c: id, r: '' }, instructor.token);
    expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'ruta', regla: 'obligatorio' })]);
  });
});

describe('Storage', () => {
  it('el bucket rechaza por sí solo un GIF subido con una URL firmada', async () => {
    const id = insertCourse('bucket');
    const url = await storage.signUpload('portadas', `cursos/${id}/directa.gif`);
    expect(await upload(url, PNG, 'image/gif')).not.toBe(200);
    expect(await storage.getObjectInfo('portadas', `cursos/${id}/directa.gif`)).toBeNull();
  });

  it('comprueba, lista y borra por objeto y por prefijo (a cualquier profundidad)', async () => {
    const id = insertCourse('prefijo');
    const paths = [`cursos/${id}/a.png`, `cursos/${id}/dir/b.png`, `cursos/${id}/dir/hondo/c.png`];
    for (const path of paths) expect(await upload(await storage.signUpload('portadas', path))).toBe(200);
    expect(await storage.getObjectInfo('portadas', paths[0])).toEqual({ contentType: 'image/png', size: PNG.length });
    await storage.deleteObject('portadas', paths[0]);
    await storage.deleteObject('portadas', paths[0]); // borrar lo que no existe no es un error
    expect(await storage.getObjectInfo('portadas', paths[0])).toBeNull();
    expect(await storage.deletePrefix('portadas', `cursos/${id}`)).toBe(2);
    expect(await storage.deletePrefix('portadas', `cursos/${id}`)).toBe(0);
    for (const path of paths) expect(await storage.getObjectInfo('portadas', path)).toBeNull();
  });

  it('la URL pública usa el prefijo /almacen', () => {
    expect(storage.publicUrl('portadas', 'cursos/1/x.png')).toBe('/almacen/object/public/portadas/cursos/1/x.png');
  });
});
