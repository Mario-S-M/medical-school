import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { cleanup, sql } from './helpers/real-env';
import { startSchool } from './helpers/start-school';
import { Account, code, courseCount, giveRole, GqlBody, newAccount, removeAccountResidue, run, setStatus } from './helpers/school-gql';

// SPEC 10, paso 5: revisión (`enviar_revision`, `cursos_en_revision`, `resolver_revision`, `retirar_curso`). La app corre EN
// PROCESO (modo desarrollo) contra el stack real, con login real. Cada prueba limpia su residuo (cursos `zz-e2e-*`, cuentas,
// roles); los datos copiados de la escuela no se tocan.

let app: NestFastifyApplication;
const userIds: string[] = [];
const TAG = `${process.pid}`;

const CREAR = 'mutation($t: String!) { crear_curso(titulo: $t) { id slug } }';
const EDITAR = `mutation($c: EnteroGrande!, $s: String, $d: String, $n: String, $k: Int) {
  editar_curso(curso_id: $c, subtitulo: $s, descripcion: $d, nivel: $n, categoria_id: $k) { id } }`;
const SECCION = 'mutation($c: EnteroGrande!, $t: String!) { guardar_seccion(curso_id: $c, titulo: $t) { id } }';
const ENVIAR = 'mutation($c: EnteroGrande!) { enviar_revision(curso_id: $c) { estado } }';
const PENDIENTES = `{ cursos_en_revision { id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria portada_ruta instructor actualizado_en
  secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion } } } }`;
const RESOLVER = `mutation($c: EnteroGrande!, $a: Boolean!, $m: String) { resolver_revision(curso_id: $c, aprobar: $a, comentario: $m) { estado } }`;
const RETIRAR = 'mutation($c: EnteroGrande!, $m: String!) { retirar_curso(curso_id: $c, comentario: $m) { estado } }';
const CATALOGO = 'query($q: String) { cursos(q: $q) { total cursos { slug } } }';
const FICHA = 'query($s: String!) { curso(slug: $s) { slug publicado_en } }';
const MIS_CURSOS = '{ mis_cursos { id estado comentario_revision } }';

let instructor: Account;
let other: Account;
let admin: Account;
let plain: Account;
let member: Account;
let before = 0;
let categoryId = 0;
const slugOf = (key: string): string => `zz-e2e-rev-${key}-${TAG}`;

const detailRules = (body: GqlBody): string[] => (body.errors?.[0]?.extensions.detalles ?? []).map((d) => d.regla);
const dbValue = (id: number, column: string): string => sql(`select coalesce(${column}::text, '<null>') from escuela.cursos where id = ${id}`);

// Curso del instructor con todos los datos pedidos (sin tocar el estado, por omisión borrador).
function insertCourse(key: string, status: 'borrador' | 'en_revision' | 'publicado' = 'borrador', owner = instructor.id): number {
  return Number(
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, subtitulo, descripcion, nivel, categoria_id, portada_ruta, estado, publicado_en)
         values ('${slugOf(key)}', '${owner}', 'ZZ Revisión ${key} ${TAG}', 'Subtítulo', 'Descripción', 'basico', ${categoryId}, 'portadas/zz-e2e-${key}.png', '${status}',
                 ${status === 'publicado' ? 'now()' : 'null'}) returning id`),
  );
}
// Una sección con una clase que tiene su video vigente `listo`.
function addReadyLesson(courseId: number, key: string): { section: number; lesson: number } {
  const section = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${courseId}, 'Sección ${key}', 1) returning id`));
  const lesson = Number(sql(`insert into escuela.clases (seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion) values (${section}, 'Clase ${key}', 'Una clase', 10, true, 1) returning id`));
  sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base) values (${lesson}, 'listo', true, 'a.mp4', 'video/mp4', 1000, 60, 'zz-e2e/rev-${key}-${TAG}/1')`);
  return { section, lesson };
}
const readyCourse = (key: string, status: 'borrador' | 'en_revision' | 'publicado' = 'borrador'): number => {
  const id = insertCourse(key, status);
  addReadyLesson(id, key);
  return id;
};

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = courseCount();
  app = await startSchool();
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  other = await newAccount(userIds);
  giveRole(other.id, 'instructor');
  admin = await newAccount(userIds);
  giveRole(admin.id, 'administrador');
  plain = await newAccount(userIds);
  member = await newAccount(userIds);
  sql(`insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('${instructor.id}', '${member.id}')`);
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${member.id}', 'equipo_apoyo')`);
  categoryId = Number(sql('select id from escuela.categorias order by id limit 1'));
});
afterAll(async () => {
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before); // no queda ningún curso de prueba y los datos copiados siguen intactos
});

describe('sin token', () => {
  it('todas las operaciones de revisión dan TOKEN_INVALIDO y no cambian nada', async () => {
    const id = insertCourse('sintoken', 'en_revision');
    const calls: [string, Record<string, unknown>][] = [
      [ENVIAR, { c: id }],
      [PENDIENTES, {}],
      [RESOLVER, { c: id, a: true }],
      [RETIRAR, { c: id, m: 'x' }],
    ];
    for (const [query, variables] of calls) expect(code(await run(app, query, variables))).toBe('TOKEN_INVALIDO');
    expect(dbValue(id, 'estado')).toBe('en_revision');
  });
});

describe('permisos', () => {
  it('los no administradores reciben SIN_PERMISO en cursos_en_revision, resolver_revision y retirar_curso', async () => {
    const pending = insertCourse('permisos', 'en_revision');
    const published = insertCourse('permisos-pub', 'publicado');
    for (const account of [plain, instructor, member]) {
      for (const [query, variables] of [[PENDIENTES, {}], [RESOLVER, { c: pending, a: true }], [RETIRAR, { c: published, m: 'x' }]] as [string, Record<string, unknown>][]) {
        const body = await run(app, query, variables, account.token);
        expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
      }
    }
    expect(dbValue(pending, 'estado')).toBe('en_revision');
    expect(dbValue(published, 'estado')).toBe('publicado');
  });

  it('el permiso se comprueba antes de validar los datos', async () => {
    expect(code(await run(app, RESOLVER, { c: 0, a: true }, plain.token))).toBe('SIN_PERMISO');
    expect(code(await run(app, RETIRAR, { c: 0, m: '' }, plain.token))).toBe('SIN_PERMISO');
  });

  it('enviar_revision: un usuario sin rol de instructor y un miembro del equipo reciben SIN_PERMISO', async () => {
    const id = readyCourse('envio-permiso');
    for (const account of [plain, member]) expect(code(await run(app, ENVIAR, { c: id }, account.token))).toBe('SIN_PERMISO');
    expect(dbValue(id, 'estado')).toBe('borrador');
  });

  it('enviar_revision: solo el dueño; otro instructor recibe SIN_PERMISO y un curso inexistente NO_ENCONTRADO', async () => {
    const id = readyCourse('envio-ajeno');
    expect(code(await run(app, ENVIAR, { c: id }, other.token))).toBe('SIN_PERMISO');
    expect(dbValue(id, 'estado')).toBe('borrador');
    const missing = await run(app, ENVIAR, { c: 9007199254000 }, instructor.token);
    expect(missing.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('enviar_revision con curso_id 0 da VALIDACION_FALLIDA', async () => {
    const body = await run(app, ENVIAR, { c: 0 }, instructor.token);
    expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'curso_id', regla: 'valor_minimo' })]);
  });
});

describe('enviar_revision', () => {
  it('un curso sin portada, con una sección vacía y una clase sin video listo da CURSO_INCOMPLETO con sus faltas', async () => {
    const id = insertCourse('incompleto');
    sql(`update escuela.cursos set portada_ruta = null where id = ${id}`);
    const withLesson = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${id}, 'Con clase', 1) returning id`));
    sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${id}, 'Vacía', 2)`);
    const lesson = Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion) values (${withLesson}, 'Sin video', 1) returning id`));
    // un video que aún no está listo (o que no es el vigente) no cuenta
    sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, ruta_base) values (${lesson}, 'procesando', false, 'a.mp4', 'video/mp4', 1000, 'zz-e2e/rev-incompleto-${TAG}/1')`);
    const body = await run(app, ENVIAR, { c: id }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'Al curso le faltan datos para enviarlo a revisión.', extensions: { codigo: 'CURSO_INCOMPLETO' } });
    expect(body.errors?.[0].extensions.detalles).toEqual([
      { campo: 'curso', regla: 'falta_portada', mensaje: 'Falta la portada.' },
      { campo: 'curso', regla: 'seccion_vacia', mensaje: 'Hay secciones sin ninguna clase.' },
      { campo: 'curso', regla: 'falta_video', mensaje: 'Hay clases sin video listo.' },
    ]);
    expect(dbValue(id, 'estado')).toBe('borrador');
  });

  it('un curso recién creado sin nada pide todos los datos, incluido el temario, en el orden del contrato', async () => {
    const created = await run(app, CREAR, { t: `ZZ Revisión vacío ${TAG}` }, instructor.token);
    const id = (created.data as { crear_curso: { id: number } }).crear_curso.id;
    const body = await run(app, ENVIAR, { c: id }, instructor.token);
    expect(detailRules(body)).toEqual(['falta_subtitulo', 'falta_descripcion', 'falta_nivel', 'falta_categoria', 'falta_portada', 'falta_secciones']);
    expect(body.errors?.[0].extensions.detalles?.map((d) => d.mensaje)).toEqual([
      'Falta el subtítulo.', 'Falta la descripción.', 'Falta elegir el nivel.', 'Falta elegir la categoría.', 'Falta la portada.', 'El curso necesita al menos una sección.',
    ]);
  });

  it('un subtítulo o descripción de solo espacios cuenta como faltante', async () => {
    const id = readyCourse('espacios');
    sql(`update escuela.cursos set subtitulo = '   ', descripcion = '  ' where id = ${id}`);
    expect(detailRules(await run(app, ENVIAR, { c: id }, instructor.token))).toEqual(['falta_subtitulo', 'falta_descripcion']);
  });

  it('con todo completo envía el curso: pasa a en_revision, borra el comentario anterior y lo devuelve', async () => {
    const id = readyCourse('completo');
    sql(`update escuela.cursos set comentario_revision = 'Corrige el título' where id = ${id}`);
    const body = await run(app, ENVIAR, { c: id }, instructor.token);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({ enviar_revision: { estado: 'en_revision' } });
    expect(dbValue(id, 'estado')).toBe('en_revision');
    expect(dbValue(id, 'comentario_revision')).toBe('<null>');
    const mine = (await run(app, MIS_CURSOS, {}, instructor.token)).data as { mis_cursos: { id: number; estado: string }[] };
    expect(mine.mis_cursos.find((c) => c.id === id)?.estado).toBe('en_revision');
  });

  it('el flujo del instructor con GraphQL: crear, editar, temario, portada y video por SQL, y enviar', async () => {
    const created = await run(app, CREAR, { t: `ZZ Revisión flujo ${TAG}` }, instructor.token);
    const { id, slug } = (created.data as { crear_curso: { id: number; slug: string } }).crear_curso;
    expect(slug).toMatch(/^zz-revision-flujo-/);
    sql(`update escuela.cursos set slug = '${slugOf('flujo')}' where id = ${id}`);
    expect((await run(app, EDITAR, { c: id, s: 'Sub', d: 'Desc', n: 'intermedio', k: categoryId }, instructor.token)).errors).toBeUndefined();
    const section = (await run(app, SECCION, { c: id, t: 'Sección' }, instructor.token)).data as { guardar_seccion: { id: number } };
    const lesson = Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion) values (${section.guardar_seccion.id}, 'Clase', 1) returning id`));
    expect(detailRules(await run(app, ENVIAR, { c: id }, instructor.token))).toEqual(['falta_portada', 'falta_video']);
    sql(`update escuela.cursos set portada_ruta = 'portadas/zz-e2e-flujo.png' where id = ${id}`);
    sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base) values (${lesson}, 'listo', true, 'a.mp4', 'video/mp4', 1000, 30, 'zz-e2e/rev-flujo-${TAG}/1')`);
    expect((await run(app, ENVIAR, { c: id }, instructor.token)).data).toEqual({ enviar_revision: { estado: 'en_revision' } });
  });

  it('un curso en revisión rechaza otro envío con CURSO_EN_REVISION y uno publicado con ESTADO_INVALIDO', async () => {
    const inReview = readyCourse('ya-en-revision', 'en_revision');
    const rejected = await run(app, ENVIAR, { c: inReview }, instructor.token);
    expect(rejected.errors?.[0]).toMatchObject({ message: 'El curso está en revisión y no se puede editar.', extensions: { codigo: 'CURSO_EN_REVISION' } });
    const published = readyCourse('ya-publicado', 'publicado');
    const invalid = await run(app, ENVIAR, { c: published }, instructor.token);
    expect(invalid.errors?.[0]).toMatchObject({ message: 'Solo se pueden enviar a revisión los cursos en borrador.', extensions: { codigo: 'ESTADO_INVALIDO' } });
    expect(dbValue(published, 'estado')).toBe('publicado');
  });
});

describe('cursos_en_revision', () => {
  it('el administrador ve solo los cursos en revisión, con su temario, del más antiguo al más reciente', async () => {
    const older = readyCourse('pend-viejo', 'en_revision');
    const newer = readyCourse('pend-nuevo', 'en_revision');
    sql(`update escuela.cursos set actualizado_en = now() - interval '2 days' where id = ${older}`);
    readyCourse('pend-borrador', 'borrador');
    readyCourse('pend-publicado', 'publicado');
    const body = await run(app, PENDIENTES, {}, admin.token);
    expect(body.errors).toBeUndefined();
    const courses = (body.data as { cursos_en_revision: { id: number; slug: string; secciones: { clases: unknown[] }[] }[] }).cursos_en_revision;
    const mine = courses.filter((c) => c.slug.startsWith('zz-e2e-rev-pend-'));
    expect(mine.map((c) => c.id)).toEqual([older, newer]);
    expect(mine[0]).toMatchObject({
      titulo: `ZZ Revisión pend-viejo ${TAG}`,
      subtitulo: 'Subtítulo',
      descripcion: 'Descripción',
      nivel: 'basico',
      lo_que_aprenderas: [],
      portada_ruta: 'portadas/zz-e2e-pend-viejo.png',
      instructor: 'Instructor e2e',
      categoria: sql(`select nombre from escuela.categorias where id = ${categoryId}`),
    });
    expect(mine[0].secciones).toEqual([
      expect.objectContaining({ titulo: 'Sección pend-viejo', posicion: 1, clases: [expect.objectContaining({ titulo: 'Clase pend-viejo', duracion_estimada_minutos: 10, es_muestra: true, posicion: 1 })] }),
    ]);
    // los cursos en revisión de los datos copiados también salen: todos están en revisión
    expect(sql(`select count(*) from escuela.cursos where estado = 'en_revision'`)).toBe(String(courses.length));
  });

  it('la consulta con el temario completo cabe en el costo máximo', async () => {
    const res = await request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', '198.18.90.1').set('Authorization', `Bearer ${admin.token}`).send({ query: PENDIENTES });
    expect(res.status).toBe(200);
  });
});

describe('resolver_revision', () => {
  it('aprobar publica el curso: fija publicado_en, borra el comentario y aparece en cursos', async () => {
    const id = readyCourse('aprobar', 'en_revision');
    sql(`update escuela.cursos set comentario_revision = 'viejo' where id = ${id}`);
    expect((await run(app, FICHA, { s: slugOf('aprobar') })).errors?.[0].extensions.codigo).toBe('NO_ENCONTRADO');
    const body = await run(app, RESOLVER, { c: id, a: true }, admin.token);
    expect(body.data).toEqual({ resolver_revision: { estado: 'publicado' } });
    expect(dbValue(id, 'estado')).toBe('publicado');
    expect(dbValue(id, 'comentario_revision')).toBe('<null>');
    expect(sql(`select publicado_en is not null and publicado_en > now() - interval '1 minute' from escuela.cursos where id = ${id}`)).toBe('t');
    const catalog = (await run(app, CATALOGO, { q: `Revisión aprobar ${TAG}` })).data as { cursos: { total: number; cursos: { slug: string }[] } };
    expect(catalog.cursos.cursos.map((c) => c.slug)).toContain(slugOf('aprobar'));
    const ficha = (await run(app, FICHA, { s: slugOf('aprobar') })).data as { curso: { slug: string; publicado_en: string } };
    expect(ficha.curso.slug).toBe(slugOf('aprobar'));
    expect(Number.isNaN(Date.parse(ficha.curso.publicado_en))).toBe(false);
  });

  it('aprobar ignora el comentario enviado', async () => {
    const id = readyCourse('aprobar-con-comentario', 'en_revision');
    expect((await run(app, RESOLVER, { c: id, a: true, m: 'Se ignora' }, admin.token)).errors).toBeUndefined();
    expect(dbValue(id, 'comentario_revision')).toBe('<null>');
  });

  it('devolver sin comentario da VALIDACION_FALLIDA y el curso sigue en revisión', async () => {
    const id = readyCourse('devolver-sin', 'en_revision');
    for (const variables of [{ c: id, a: false }, { c: id, a: false, m: '' }, { c: id, a: false, m: '   ' }]) {
      const body = await run(app, RESOLVER, variables, admin.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'Revisa los datos enviados.', extensions: { codigo: 'VALIDACION_FALLIDA' } });
      expect(body.errors?.[0].extensions.detalles).toEqual([
        { campo: 'comentario', regla: 'obligatorio_si_se_devuelve', mensaje: 'Explica al instructor qué debe cambiar.' },
      ]);
    }
    expect(dbValue(id, 'estado')).toBe('en_revision');
  });

  it('devolver con comentario regresa el curso a borrador, guarda el comentario y no aparece en el catálogo', async () => {
    const id = readyCourse('devolver', 'en_revision');
    const body = await run(app, RESOLVER, { c: id, a: false, m: '  Mejora la descripción\ny el título  ' }, admin.token);
    expect(body.data).toEqual({ resolver_revision: { estado: 'borrador' } });
    expect(dbValue(id, 'estado')).toBe('borrador');
    expect(dbValue(id, 'comentario_revision')).toBe('Mejora la descripción\ny el título');
    expect(dbValue(id, 'publicado_en')).toBe('<null>');
    const mine = (await run(app, MIS_CURSOS, {}, instructor.token)).data as { mis_cursos: { id: number; comentario_revision: string | null }[] };
    expect(mine.mis_cursos.find((c) => c.id === id)?.comentario_revision).toBe('Mejora la descripción\ny el título');
    expect((await run(app, FICHA, { s: slugOf('devolver') })).errors?.[0].extensions.codigo).toBe('NO_ENCONTRADO');
    // el instructor puede volver a enviarlo
    expect((await run(app, ENVIAR, { c: id }, instructor.token)).data).toEqual({ enviar_revision: { estado: 'en_revision' } });
  });

  it('un curso que no está en revisión da ESTADO_INVALIDO 409 y uno inexistente NO_ENCONTRADO', async () => {
    for (const status of ['borrador', 'publicado'] as const) {
      const id = readyCourse(`resolver-${status}`, status);
      const body = await run(app, RESOLVER, { c: id, a: true }, admin.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'Solo se pueden resolver cursos que están en revisión.', extensions: { codigo: 'ESTADO_INVALIDO' } });
      expect(dbValue(id, 'estado')).toBe(status);
      // el estado se comprueba antes que el comentario
      expect(code(await run(app, RESOLVER, { c: id, a: false }, admin.token))).toBe('ESTADO_INVALIDO');
    }
    const missing = await run(app, RESOLVER, { c: 9007199254000, a: true }, admin.token);
    expect(missing.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('resolver dos veces el mismo curso: la segunda da ESTADO_INVALIDO', async () => {
    const id = readyCourse('doble', 'en_revision');
    expect((await run(app, RESOLVER, { c: id, a: true }, admin.token)).errors).toBeUndefined();
    expect(code(await run(app, RESOLVER, { c: id, a: true }, admin.token))).toBe('ESTADO_INVALIDO');
  });

  it('valida curso_id y la longitud del comentario (1000)', async () => {
    const id = readyCourse('validar', 'en_revision');
    const zero = await run(app, RESOLVER, { c: 0, a: true }, admin.token);
    expect(zero.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'curso_id', regla: 'valor_minimo' })]);
    const long = await run(app, RESOLVER, { c: id, a: false, m: 'x'.repeat(1001) }, admin.token);
    expect(long.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'comentario', regla: 'maximo_caracteres' })]);
    expect((await run(app, RESOLVER, { c: id, a: false, m: 'x'.repeat(1000) }, admin.token)).errors).toBeUndefined();
  });

  it('el administrador puede resolver cursos de cualquier instructor aunque no sea su dueño', async () => {
    const id = Number(sql(`insert into escuela.cursos (slug, instructor_id, titulo, estado) values ('${slugOf('ajeno')}', '${other.id}', 'ZZ Ajeno ${TAG}', 'en_revision') returning id`));
    expect((await run(app, RESOLVER, { c: id, a: true }, admin.token)).data).toEqual({ resolver_revision: { estado: 'publicado' } });
  });
});

describe('retirar_curso', () => {
  it('retira un curso publicado: vuelve a borrador con el comentario, sale del catálogo y su ficha da NO_ENCONTRADO', async () => {
    const id = readyCourse('retirar', 'publicado');
    expect(((await run(app, CATALOGO, { q: `Revisión retirar ${TAG}` })).data as { cursos: { total: number } }).cursos.total).toBe(1);
    const body = await run(app, RETIRAR, { c: id, m: 'Contenido desactualizado' }, admin.token);
    expect(body.data).toEqual({ retirar_curso: { estado: 'borrador' } });
    expect(dbValue(id, 'estado')).toBe('borrador');
    expect(dbValue(id, 'comentario_revision')).toBe('Contenido desactualizado');
    expect(((await run(app, CATALOGO, { q: `Revisión retirar ${TAG}` })).data as { cursos: { total: number } }).cursos.total).toBe(0);
    const ficha = await run(app, FICHA, { s: slugOf('retirar') });
    expect(ficha.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('un curso que no está publicado da ESTADO_INVALIDO 409 y uno inexistente NO_ENCONTRADO', async () => {
    for (const status of ['borrador', 'en_revision'] as const) {
      const id = readyCourse(`retirar-${status}`, status);
      const body = await run(app, RETIRAR, { c: id, m: 'x' }, admin.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'Solo se pueden retirar los cursos publicados.', extensions: { codigo: 'ESTADO_INVALIDO' } });
      expect(dbValue(id, 'estado')).toBe(status);
    }
    expect(code(await run(app, RETIRAR, { c: 9007199254000, m: 'x' }, admin.token))).toBe('NO_ENCONTRADO');
  });

  it('el comentario es obligatorio y de hasta 1000 caracteres', async () => {
    const id = readyCourse('retirar-valida', 'publicado');
    for (const m of ['', '   ']) {
      const body = await run(app, RETIRAR, { c: id, m }, admin.token);
      expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
      expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'comentario', regla: 'obligatorio' })]);
    }
    const long = await run(app, RETIRAR, { c: id, m: 'x'.repeat(1001) }, admin.token);
    expect(long.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'comentario', regla: 'maximo_caracteres' })]);
    expect(dbValue(id, 'estado')).toBe('publicado');
  });
});

describe('ciclo completo', () => {
  it('borrador -> enviar -> devolver -> enviar -> aprobar -> retirar, con un estado correcto en cada paso', async () => {
    const id = readyCourse('ciclo');
    setStatus(id, 'borrador');
    const steps: [string, Record<string, unknown>, Account, string][] = [
      [ENVIAR, { c: id }, instructor, 'en_revision'],
      [RESOLVER, { c: id, a: false, m: 'Falta pulir' }, admin, 'borrador'],
      [ENVIAR, { c: id }, instructor, 'en_revision'],
      [RESOLVER, { c: id, a: true }, admin, 'publicado'],
      [RETIRAR, { c: id, m: 'Se retira' }, admin, 'borrador'],
    ];
    for (const [query, variables, account, expected] of steps) {
      const body = await run(app, query, variables, account.token);
      expect(body.errors).toBeUndefined();
      expect(Object.values(body.data as Record<string, { estado: string }>)[0].estado).toBe(expected);
      expect(dbValue(id, 'estado')).toBe(expected);
    }
  });
});
