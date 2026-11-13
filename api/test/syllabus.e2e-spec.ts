import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { cleanup, sql } from './helpers/real-env';
import { startSchool } from './helpers/start-school';
import { Account, addToTeam, code, courseCount, giveRole, gql, GqlBody, newAccount, removeAccountResidue, run, setStatus } from './helpers/school-gql';

// SPEC 10, paso 3: temario (`guardar_seccion`, `borrar_seccion`, `guardar_clase`, `borrar_clase`, `mover`). La app corre EN
// PROCESO (modo desarrollo) contra el stack real, con login real. Cada prueba limpia su residuo; los datos copiados no se tocan.

let app: NestFastifyApplication;
const userIds: string[] = [];
const TAG = `${process.pid}`;

const CREAR = 'mutation($t: String!) { crear_curso(titulo: $t) { id slug } }';
const SECCION = 'mutation($c: EnteroGrande!, $s: EnteroGrande, $t: String!) { guardar_seccion(curso_id: $c, seccion_id: $s, titulo: $t) { id } }';
const BORRAR_SECCION = 'mutation($s: EnteroGrande!) { borrar_seccion(seccion_id: $s) { ok } }';
const CLASE = `mutation($s: EnteroGrande!, $k: EnteroGrande, $t: String!, $d: String, $m: Int, $e: Boolean!) {
  guardar_clase(seccion_id: $s, clase_id: $k, titulo: $t, descripcion: $d, duracion_estimada_minutos: $m, es_muestra: $e) { id } }`;
const BORRAR_CLASE = 'mutation($k: EnteroGrande!) { borrar_clase(clase_id: $k) { ok } }';
const MOVER = 'mutation($t: String!, $i: EnteroGrande!, $d: String!) { mover(tipo: $t, id: $i, direccion: $d) { ok } }';
const EDITAR = 'mutation($c: EnteroGrande!, $t: String) { editar_curso(curso_id: $c, titulo: $t) { id } }';
const EDICION = 'query($id: EnteroGrande!) { curso_edicion(id: $id) { secciones { id titulo posicion clases { id titulo posicion } } } }';

const details = (body: GqlBody) => body.errors?.[0]?.extensions.detalles;
const ids = (text: string): number[] => (text === '' ? [] : text.split('\n').map(Number));
const sectionIds = (courseId: number): number[] => ids(sql(`select id from escuela.secciones where curso_id = ${courseId} order by posicion`));
const sectionPositions = (courseId: number): number[] => ids(sql(`select posicion from escuela.secciones where curso_id = ${courseId} order by posicion`));
const lessonIds = (sectionId: number): number[] => ids(sql(`select id from escuela.clases where seccion_id = ${sectionId} order by posicion`));
const lessonPositions = (sectionId: number): number[] => ids(sql(`select posicion from escuela.clases where seccion_id = ${sectionId} order by posicion`));
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const errorCode = (body: unknown): string => (body as { error: { codigo: string } }).error.codigo;

let before = 0;
let instructor: Account;
let other: Account;
let member: Account;
let plain: Account;
let courseCounter = 0;

async function newCourse(owner = instructor): Promise<number> {
  const body = await run(app, CREAR, { t: `ZZ E2E Temario ${TAG} ${courseCounter++}` }, owner.token);
  return (body.data as { crear_curso: { id: number } }).crear_curso.id;
}
async function addSection(courseId: number, title: string, account = instructor): Promise<number> {
  const body = await run(app, SECCION, { c: courseId, t: title }, account.token);
  expect(body.errors).toBeUndefined();
  return (body.data as { guardar_seccion: { id: number } }).guardar_seccion.id;
}
async function addLesson(sectionId: number, title: string, account = instructor): Promise<number> {
  const body = await run(app, CLASE, { s: sectionId, t: title, e: false }, account.token);
  expect(body.errors).toBeUndefined();
  return (body.data as { guardar_clase: { id: number } }).guardar_clase.id;
}
async function move(type: 'seccion' | 'clase', id: number, direction: 'subir' | 'bajar', account = instructor): Promise<GqlBody> {
  return run(app, MOVER, { t: type, i: id, d: direction }, account.token);
}
const insertVideo = (lessonId: number): void =>
  void sql(
    `insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base)
     values (${lessonId}, 'listo', true, 'a.mp4', 'video/mp4', 100, 10, 'cursos/zz-e2e/${lessonId}')`,
  );

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = courseCount();
  app = await startSchool();
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  other = await newAccount(userIds);
  giveRole(other.id, 'instructor');
  member = await newAccount(userIds);
  addToTeam(instructor.id, member.id);
  plain = await newAccount(userIds);
});
afterAll(async () => {
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before);
});

describe('permisos generales', () => {
  it('sin token todas las operaciones del temario dan TOKEN_INVALIDO', async () => {
    const calls: [string, Record<string, unknown>][] = [
      [SECCION, { c: 1, t: 'Sección' }],
      [BORRAR_SECCION, { s: 1 }],
      [CLASE, { s: 1, t: 'Clase', e: false }],
      [BORRAR_CLASE, { k: 1 }],
      [MOVER, { t: 'seccion', i: 1, d: 'subir' }],
    ];
    for (const [query, variables] of calls) expect(code(await run(app, query, variables))).toBe('TOKEN_INVALIDO');
  });

  it('un usuario sin rol recibe SIN_PERMISO antes de validar y no cambia nada', async () => {
    const courseId = await newCourse();
    const sectionId = await addSection(courseId, 'Sección única');
    const lessonId = await addLesson(sectionId, 'Clase única');
    const calls: [string, Record<string, unknown>][] = [
      [SECCION, { c: courseId, t: 'Intruso' }],
      [SECCION, { c: 0, t: '' }], // inválida, pero primero el permiso
      [BORRAR_SECCION, { s: sectionId }],
      [CLASE, { s: sectionId, t: 'Intruso', e: false }],
      [BORRAR_CLASE, { k: lessonId }],
      [MOVER, { t: 'clase', i: lessonId, d: 'bajar' }],
    ];
    for (const [query, variables] of calls) {
      const body = await run(app, query, variables, plain.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
    }
    expect(sectionIds(courseId)).toEqual([sectionId]);
    expect(lessonIds(sectionId)).toEqual([lessonId]);
  });

  it('en un curso ajeno (otro instructor) editar, mover y borrar dan SIN_PERMISO y no cambian nada', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'Primera');
    const s2 = await addSection(courseId, 'Segunda');
    const k1 = await addLesson(s1, 'Clase 1');
    const k2 = await addLesson(s1, 'Clase 2');
    const calls: [string, Record<string, unknown>][] = [
      [SECCION, { c: courseId, t: 'Nueva' }],
      [SECCION, { c: courseId, s: s1, t: 'Renombrada' }],
      [BORRAR_SECCION, { s: s1 }],
      [CLASE, { s: s1, t: 'Nueva', e: false }],
      [CLASE, { s: s1, k: k1, t: 'Renombrada', e: true }],
      [BORRAR_CLASE, { k: k1 }],
      [MOVER, { t: 'seccion', i: s2, d: 'subir' }],
      [MOVER, { t: 'clase', i: k2, d: 'subir' }],
    ];
    for (const [query, variables] of calls) expect(code(await run(app, query, variables, other.token))).toBe('SIN_PERMISO');
    expect(sectionIds(courseId)).toEqual([s1, s2]);
    expect(lessonIds(s1)).toEqual([k1, k2]);
    expect(sql(`select string_agg(titulo, ',' order by id) from escuela.secciones where curso_id = ${courseId}`)).toBe('Primera,Segunda');
  });
});

describe('guardar_seccion', () => {
  it('crea secciones al final con posiciones 1..n y devuelve { id }; con seccion_id edita el título', async () => {
    const courseId = await newCourse();
    const a = await addSection(courseId, '  Introducción  ');
    const b = await addSection(courseId, 'Huesos');
    const c = await addSection(courseId, 'Músculos');
    expect(sectionIds(courseId)).toEqual([a, b, c]);
    expect(sectionPositions(courseId)).toEqual([1, 2, 3]);
    expect(sql(`select titulo from escuela.secciones where id = ${a}`)).toBe('Introducción');
    expect(await run(app, SECCION, { c: courseId, s: b, t: 'Esqueleto' }, instructor.token)).toEqual({ data: { guardar_seccion: { id: b } } });
    expect(sql(`select titulo from escuela.secciones where id = ${b}`)).toBe('Esqueleto');
    expect(sectionPositions(courseId)).toEqual([1, 2, 3]);
  });

  it('tocar el temario actualiza actualizado_en del curso (trigger)', async () => {
    const courseId = await newCourse();
    sql(`update escuela.cursos set actualizado_en = now() - interval '1 hour' where id = ${courseId}`);
    await addSection(courseId, 'Cambia la fecha');
    expect(sql(`select actualizado_en > now() - interval '1 minute' from escuela.cursos where id = ${courseId}`)).toBe('t');
  });

  it('dos secciones creadas a la vez no repiten posición', async () => {
    const courseId = await newCourse();
    await Promise.all(range(6).map((n) => addSection(courseId, `Concurrente ${n}`)));
    expect(sectionPositions(courseId)).toEqual(range(6));
  });

  it('una sección de otro curso (o inexistente) da NO_ENCONTRADO "La sección no existe en este curso."', async () => {
    const mine = await newCourse();
    const theirs = await newCourse();
    const foreign = await addSection(theirs, 'De otro curso');
    for (const s of [foreign, 9007199254740]) {
      const body = await run(app, SECCION, { c: mine, s, t: 'Cambio' }, instructor.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'La sección no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
    }
    expect(sql(`select titulo from escuela.secciones where id = ${foreign}`)).toBe('De otro curso');
    const noCourse = await run(app, SECCION, { c: 9007199254740, t: 'Sección' }, instructor.token);
    expect(noCourse.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('valida el título y los ids, y rechaza los campos de más', async () => {
    const courseId = await newCourse();
    expect(details(await run(app, SECCION, { c: courseId, t: '   ' }, instructor.token))).toEqual([{ campo: 'titulo', regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' }]);
    expect(details(await run(app, SECCION, { c: courseId, t: 'x'.repeat(121) }, instructor.token))).toEqual([
      { campo: 'titulo', regla: 'maximo_caracteres', mensaje: 'Debe tener como máximo 120 caracteres.' },
    ]);
    expect(details(await run(app, SECCION, { c: courseId, t: 'Con\u0001control' }, instructor.token))?.[0]).toMatchObject({ regla: 'sin_caracteres_de_control' });
    expect(
      details(await run(app, SECCION, { c: 0, s: 9007199254741, t: 'Sección' }, instructor.token))
        ?.map((d) => `${d.campo}:${d.regla}`)
        .sort(),
    ).toEqual(['curso_id:valor_minimo', 'seccion_id:valor_maximo']);
    expect((await run(app, SECCION, { c: courseId, t: 'x'.repeat(120) }, instructor.token)).errors).toBeUndefined();
    const extra = await gql(app, `mutation { guardar_seccion(curso_id: ${courseId}, titulo: "Sección", posicion: 1) { id } }`, {}, instructor.token).expect(400);
    expect(errorCode(extra.body)).toBe('SOLICITUD_INVALIDA');
    expect(sectionIds(courseId)).toHaveLength(1);
  });
});

describe('guardar_clase', () => {
  it('crea clases al final con posiciones 1..n, guarda los campos y la edición no cambia la posición', async () => {
    const courseId = await newCourse();
    const sectionId = await addSection(courseId, 'Sección');
    const body = await run(app, CLASE, { s: sectionId, t: ' Clase uno ', d: 'Primera\nclase', m: 15, e: true }, instructor.token);
    const first = (body.data as { guardar_clase: { id: number } }).guardar_clase.id;
    const second = await addLesson(sectionId, 'Clase dos');
    expect(lessonIds(sectionId)).toEqual([first, second]);
    expect(lessonPositions(sectionId)).toEqual([1, 2]);
    expect(sql(`select titulo || '|' || replace(descripcion, E'\\n', '/') || '|' || duracion_estimada_minutos || '|' || es_muestra from escuela.clases where id = ${first}`)).toBe('Clase uno|Primera/clase|15|true');
    expect(sql(`select coalesce(descripcion, '<null>') || '|' || coalesce(duracion_estimada_minutos::text, '<null>') || '|' || es_muestra from escuela.clases where id = ${second}`)).toBe('<null>|<null>|false');
    // la edición reemplaza todos los campos (lo no enviado queda vacío)
    expect(await run(app, CLASE, { s: sectionId, k: first, t: 'Clase uno editada', e: false }, instructor.token)).toEqual({ data: { guardar_clase: { id: first } } });
    expect(sql(`select titulo || '|' || coalesce(descripcion, '<null>') || '|' || coalesce(duracion_estimada_minutos::text, '<null>') || '|' || es_muestra || '|' || posicion from escuela.clases where id = ${first}`)).toBe('Clase uno editada|<null>|<null>|false|1');
  });

  it('una clase de otra sección da NO_ENCONTRADO "La clase no existe en este curso."; una sección inexistente, "El curso no existe."', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'Una');
    const s2 = await addSection(courseId, 'Dos');
    const k2 = await addLesson(s2, 'En la dos');
    const wrong = await run(app, CLASE, { s: s1, k: k2, t: 'Cambio', e: false }, instructor.token);
    expect(wrong.errors?.[0]).toMatchObject({ message: 'La clase no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(sql(`select titulo from escuela.clases where id = ${k2}`)).toBe('En la dos');
    const none = await run(app, CLASE, { s: 9007199254740, t: 'Clase', e: false }, instructor.token);
    expect(none.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('valida título, descripción, duración y es_muestra, y rechaza los campos de más', async () => {
    const courseId = await newCourse();
    const s = await addSection(courseId, 'Sección');
    const check = (variables: Record<string, unknown>) => run(app, CLASE, { s, t: 'Clase', e: false, ...variables }, instructor.token);
    expect(details(await check({ t: '' }))).toEqual([{ campo: 'titulo', regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' }]);
    expect(details(await check({ d: 'x'.repeat(2001) }))).toEqual([{ campo: 'descripcion', regla: 'maximo_caracteres', mensaje: 'Debe tener como máximo 2000 caracteres.' }]);
    expect(details(await check({ m: 0 }))).toEqual([{ campo: 'duracion_estimada_minutos', regla: 'valor_minimo', mensaje: 'Debe ser al menos 1.' }]);
    expect(details(await check({ m: 181 }))).toEqual([{ campo: 'duracion_estimada_minutos', regla: 'valor_maximo', mensaje: 'Debe ser como máximo 180.' }]);
    expect(lessonIds(s)).toHaveLength(0);
    expect((await check({ m: 180, d: 'x'.repeat(2000) })).errors).toBeUndefined(); // límites exactos
    const missing = await gql(app, `mutation { guardar_clase(seccion_id: ${s}, titulo: "Sin muestra") { id } }`, {}, instructor.token).expect(400);
    expect(errorCode(missing.body)).toBe('SOLICITUD_INVALIDA');
    const extra = await gql(app, `mutation { guardar_clase(seccion_id: ${s}, titulo: "Con extra", es_muestra: true, posicion: 3) { id } }`, {}, instructor.token).expect(400);
    expect(errorCode(extra.body)).toBe('SOLICITUD_INVALIDA');
    expect(lessonIds(s)).toHaveLength(1);
  });
});

describe('mover y borrar mantienen las posiciones en 1..n', () => {
  it('subir y bajar secciones intercambia con el vecino; el primero no sube ni el último baja', async () => {
    const courseId = await newCourse();
    const [a, b, c, d] = [await addSection(courseId, 'A'), await addSection(courseId, 'B'), await addSection(courseId, 'C'), await addSection(courseId, 'D')];
    expect(await move('seccion', c, 'subir')).toEqual({ data: { mover: { ok: true } } });
    expect(sectionIds(courseId)).toEqual([a, c, b, d]);
    await move('seccion', a, 'bajar');
    expect(sectionIds(courseId)).toEqual([c, a, b, d]);
    // el primero hacia arriba y el último hacia abajo: ok y nada cambia
    expect(await move('seccion', c, 'subir')).toEqual({ data: { mover: { ok: true } } });
    expect(await move('seccion', d, 'bajar')).toEqual({ data: { mover: { ok: true } } });
    expect(sectionIds(courseId)).toEqual([c, a, b, d]);
    expect(sectionPositions(courseId)).toEqual([1, 2, 3, 4]);
  });

  it('subir y bajar clases solo mueve dentro de su sección', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'S1');
    const s2 = await addSection(courseId, 'S2');
    const [k1, k2, k3] = [await addLesson(s1, 'K1'), await addLesson(s1, 'K2'), await addLesson(s1, 'K3')];
    const alone = await addLesson(s2, 'Sola');
    await move('clase', k3, 'subir');
    expect(lessonIds(s1)).toEqual([k1, k3, k2]);
    await move('clase', k1, 'bajar');
    expect(lessonIds(s1)).toEqual([k3, k1, k2]);
    expect(await move('clase', k3, 'subir')).toEqual({ data: { mover: { ok: true } } });
    expect(await move('clase', alone, 'bajar')).toEqual({ data: { mover: { ok: true } } });
    expect(lessonIds(s1)).toEqual([k3, k1, k2]);
    expect(lessonPositions(s1)).toEqual([1, 2, 3]);
    expect(lessonIds(s2)).toEqual([alone]);
  });

  it('borrar una sección renumera las demás y borra sus clases y videos', async () => {
    const courseId = await newCourse();
    const [a, b, c] = [await addSection(courseId, 'A'), await addSection(courseId, 'B'), await addSection(courseId, 'C')];
    const k1 = await addLesson(b, 'K1');
    await addLesson(b, 'K2');
    insertVideo(k1);
    expect(await run(app, BORRAR_SECCION, { s: b }, instructor.token)).toEqual({ data: { borrar_seccion: { ok: true } } });
    expect(sectionIds(courseId)).toEqual([a, c]);
    expect(sectionPositions(courseId)).toEqual([1, 2]);
    expect(sql(`select count(*) from escuela.clases where seccion_id = ${b}`)).toBe('0');
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${k1}`)).toBe('0');
    const again = await run(app, BORRAR_SECCION, { s: b }, instructor.token);
    expect(again.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } }); // ya no hay de dónde sacar el curso
  });

  it('borrar una clase renumera las demás de su sección y borra su video', async () => {
    const courseId = await newCourse();
    const s = await addSection(courseId, 'S');
    const [k1, k2, k3] = [await addLesson(s, 'K1'), await addLesson(s, 'K2'), await addLesson(s, 'K3')];
    insertVideo(k2);
    expect(await run(app, BORRAR_CLASE, { k: k2 }, instructor.token)).toEqual({ data: { borrar_clase: { ok: true } } });
    expect(lessonIds(s)).toEqual([k1, k3]);
    expect(lessonPositions(s)).toEqual([1, 2]);
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${k2}`)).toBe('0');
    await run(app, BORRAR_CLASE, { k: k1 }, instructor.token);
    expect(lessonPositions(s)).toEqual([1]);
    await run(app, BORRAR_CLASE, { k: k3 }, instructor.token);
    expect(lessonIds(s)).toEqual([]);
  });

  it('una secuencia de subir, bajar y borrar deja siempre 1..n en los dos niveles', async () => {
    const courseId = await newCourse();
    const sections: number[] = [];
    for (const title of ['A', 'B', 'C', 'D', 'E']) sections.push(await addSection(courseId, title));
    const lessons: number[] = [];
    for (const title of ['K1', 'K2', 'K3', 'K4']) lessons.push(await addLesson(sections[0], title));
    await move('seccion', sections[4], 'subir');
    await move('seccion', sections[0], 'bajar');
    await move('clase', lessons[3], 'subir');
    await move('clase', lessons[0], 'bajar');
    await run(app, BORRAR_SECCION, { s: sections[2] }, instructor.token);
    await run(app, BORRAR_CLASE, { k: lessons[1] }, instructor.token);
    await move('seccion', sections[1], 'subir');
    expect(sectionPositions(courseId)).toEqual(range(4));
    expect(lessonPositions(sections[0])).toEqual(range(3));
    const tree = (await run(app, EDICION, { id: courseId }, instructor.token)).data?.curso_edicion as { secciones: { posicion: number; clases: { posicion: number }[] }[] };
    expect(tree.secciones.map((s) => s.posicion)).toEqual(range(4));
    expect(tree.secciones.find((s) => s.clases.length > 0)?.clases.map((k) => k.posicion)).toEqual(range(3));
  });

  it('un elemento que no existe da NO_ENCONTRADO y los valores no válidos VALIDACION_FALLIDA', async () => {
    const missing = await move('seccion', 9007199254740, 'subir');
    expect(missing.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    const bad = await run(app, MOVER, { t: 'curso', i: 0, d: 'izquierda' }, instructor.token);
    expect(details(bad)?.map((d) => `${d.campo}:${d.regla}`).sort()).toEqual(['direccion:valor_no_permitido', 'id:valor_minimo', 'tipo:valor_no_permitido']);
    expect(details(bad)?.find((d) => d.campo === 'direccion')?.mensaje).toBe('Debe ser uno de: subir, bajar.');
  });
});

describe('equipo de apoyo', () => {
  it('edita el temario del instructor (secciones, clases, orden y borrado) pero no editar_curso', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'Del instructor');
    const s2 = await addSection(courseId, 'Del equipo', member);
    const k1 = await addLesson(s1, 'Clase del equipo', member);
    expect(await move('seccion', s2, 'subir', member)).toEqual({ data: { mover: { ok: true } } });
    expect(sectionIds(courseId)).toEqual([s2, s1]);
    expect((await run(app, SECCION, { c: courseId, s: s2, t: 'Renombrada por el equipo' }, member.token)).errors).toBeUndefined();
    expect(await run(app, BORRAR_CLASE, { k: k1 }, member.token)).toEqual({ data: { borrar_clase: { ok: true } } });
    expect(await run(app, BORRAR_SECCION, { s: s2 }, member.token)).toEqual({ data: { borrar_seccion: { ok: true } } });
    expect(sectionIds(courseId)).toEqual([s1]);
    const edit = await run(app, EDITAR, { c: courseId, t: 'Título del equipo' }, member.token);
    expect(edit.errors?.[0]).toMatchObject({ extensions: { codigo: 'SIN_PERMISO' } });
    expect(sql(`select titulo from escuela.cursos where id = ${courseId}`)).not.toBe('Título del equipo');
  });

  it('al quitarlo del equipo pierde el acceso al temario', async () => {
    const courseId = await newCourse();
    sql(`delete from escuela.equipos_apoyo where instructor_id = '${instructor.id}' and miembro_id = '${member.id}'`);
    try {
      expect(code(await run(app, SECCION, { c: courseId, t: 'Ya no' }, member.token))).toBe('SIN_PERMISO');
    } finally {
      addToTeam(instructor.id, member.id);
    }
  });
});

describe('estado del curso', () => {
  it('en_revision rechaza guardar_seccion, guardar_clase, borrar y mover con CURSO_EN_REVISION y no cambia nada', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'S1');
    const s2 = await addSection(courseId, 'S2');
    const k1 = await addLesson(s1, 'K1');
    const k2 = await addLesson(s1, 'K2');
    setStatus(courseId, 'en_revision');
    const calls: [string, Record<string, unknown>][] = [
      [SECCION, { c: courseId, t: 'Nueva' }],
      [SECCION, { c: courseId, s: s1, t: 'Cambio' }],
      [CLASE, { s: s1, t: 'Nueva', e: false }],
      [CLASE, { s: s1, k: k1, t: 'Cambio', e: false }],
      [BORRAR_SECCION, { s: s2 }],
      [BORRAR_CLASE, { k: k2 }],
      [MOVER, { t: 'seccion', i: s2, d: 'subir' }],
      [MOVER, { t: 'clase', i: k2, d: 'subir' }],
    ];
    for (const user of [instructor, member]) {
      for (const [query, variables] of calls) {
        const body = await run(app, query, variables, user.token);
        expect(body.errors?.[0]).toMatchObject({ message: 'El curso está en revisión y no se puede editar.', extensions: { codigo: 'CURSO_EN_REVISION' } });
      }
    }
    expect(sectionIds(courseId)).toEqual([s1, s2]);
    expect(lessonIds(s1)).toEqual([k1, k2]);
    expect(sql(`select titulo from escuela.secciones where id = ${s1}`)).toBe('S1');
    expect((await run(app, EDICION, { id: courseId }, instructor.token)).errors).toBeUndefined(); // leer sí se puede
  });

  it('un curso publicado sí se edita y mover mantiene 1..n', async () => {
    const courseId = await newCourse();
    const s1 = await addSection(courseId, 'S1');
    const s2 = await addSection(courseId, 'S2');
    setStatus(courseId, 'publicado');
    const s3 = await addSection(courseId, 'S3');
    await move('seccion', s2, 'subir');
    expect(sectionIds(courseId)).toEqual([s2, s1, s3]);
    expect(sectionPositions(courseId)).toEqual([1, 2, 3]);
    expect(sql(`select estado from escuela.cursos where id = ${courseId}`)).toBe('publicado');
  });
});
