import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { cleanup, sql } from './helpers/real-env';
import { startSchool } from './helpers/start-school';
import { Account, addToTeam, code, courseCount, giveRole, gql, GqlBody, newAccount, removeAccountResidue, run, setStatus } from './helpers/school-gql';

// SPEC 10, paso 3: cursos (`crear_curso`, `editar_curso`, `mis_cursos`, `curso_edicion`) y su política de acceso. La app corre
// EN PROCESO (modo desarrollo) contra el stack real, con login real. Cada prueba limpia su residuo (cursos `zz-e2e-*`,
// cuentas, roles, equipos); los datos copiados de la escuela no se tocan.

let app: NestFastifyApplication;
const userIds: string[] = [];
const TAG = `${process.pid}`;
const TITLE = `ZZ E2E Anatomía básica ${TAG}`; // slug: zz-e2e-anatomia-basica-<pid>
const SLUG = `zz-e2e-anatomia-basica-${TAG}`;

const CREAR = 'mutation($t: String!) { crear_curso(titulo: $t) { id slug } }';
const EDITAR = `mutation($c: EnteroGrande!, $t: String, $s: String, $d: String, $p: String, $l: [String!], $n: String, $k: Int) {
  editar_curso(curso_id: $c, titulo: $t, subtitulo: $s, descripcion: $d, conocimientos_previos: $p, lo_que_aprenderas: $l, nivel: $n, categoria_id: $k) { id } }`;
const MIS_CURSOS = '{ mis_cursos { id slug titulo estado comentario_revision portada_ruta actualizado_en es_mio instructor } }';
const EDICION = `query($id: EnteroGrande!) { curso_edicion(id: $id) {
  id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria_id estado comentario_revision portada_ruta actualizado_en es_dueno
  secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion video { estado duracion_segundos } video_nuevo { id estado error } } } } }`;

interface Created {
  id: number;
  slug: string;
}
const dbCourse = (id: number, column: string): string => sql(`select ${column} from escuela.cursos where id = ${id}`);
async function createCourse(account: Account, title = TITLE): Promise<Created> {
  const body = await run(app, CREAR, { t: title }, account.token);
  expect(body.errors).toBeUndefined();
  return (body.data as { crear_curso: Created }).crear_curso;
}
const details = (body: GqlBody) => body.errors?.[0]?.extensions.detalles;

let before = 0;
let instructor: Account;
let other: Account;
let member: Account;
let plain: Account;

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
  expect(courseCount()).toBe(before); // no queda ningún curso de prueba y los datos copiados siguen intactos
});

describe('sin token', () => {
  it('todas las operaciones de cursos dan TOKEN_INVALIDO y no crean nada', async () => {
    const calls: [string, Record<string, unknown>][] = [
      [CREAR, { t: TITLE }],
      [EDITAR, { c: 1, t: 'Un título nuevo' }],
      [MIS_CURSOS, {}],
      [EDICION, { id: 1 }],
    ];
    for (const [query, variables] of calls) expect(code(await run(app, query, variables))).toBe('TOKEN_INVALIDO');
    expect(sql(`select count(*) from escuela.cursos where slug like 'zz-e2e-%'`)).toBe('0');
  });
});

describe('crear_curso', () => {
  it('un usuario sin rol de instructor recibe SIN_PERMISO y no se crea nada', async () => {
    const body = await run(app, CREAR, { t: TITLE }, plain.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
    expect(sql(`select count(*) from escuela.cursos where slug like 'zz-e2e-%'`)).toBe('0');
  });

  it('el equipo de apoyo tampoco crea cursos, y el permiso va antes que la validación', async () => {
    expect(code(await run(app, CREAR, { t: TITLE }, member.token))).toBe('SIN_PERMISO');
    expect(code(await run(app, CREAR, { t: 'x' }, plain.token))).toBe('SIN_PERMISO');
  });

  it('un instructor crea el curso: slug sin acentos, borrador, suyo, y el segundo con el mismo título recibe -2 y -3', async () => {
    const first = await createCourse(instructor);
    expect(first).toEqual({ id: expect.any(Number), slug: SLUG });
    expect(dbCourse(first.id, `estado || '|' || instructor_id || '|' || titulo`)).toBe(`borrador|${instructor.id}|${TITLE}`);
    const second = await createCourse(instructor);
    expect(second.slug).toBe(`${SLUG}-2`);
    expect((await createCourse(other)).slug).toBe(`${SLUG}-3`); // el slug es global, no por instructor
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('el título se recorta y un título sin letras ni números ni "curso" válido: da VALIDACION_FALLIDA', async () => {
    const created = await createCourse(instructor, `   zz e2e Recortado ${TAG}   `);
    expect(created.slug).toBe(`zz-e2e-recortado-${TAG}`);
    expect(dbCourse(created.id, 'titulo')).toBe(`zz e2e Recortado ${TAG}`);
    expect(details(await run(app, CREAR, { t: '!!!!!!' }, instructor.token))).toEqual([
      { campo: 'titulo', regla: 'requiere_letra_o_numero', mensaje: 'Debe incluir al menos una letra o un número.' },
    ]);
  });

  it('valida el título con los mensajes del workflow', async () => {
    const check = async (t: string) => run(app, CREAR, { t }, instructor.token);
    const short = await check('abcd');
    expect(short.errors?.[0]).toMatchObject({ message: 'Revisa los datos enviados.', extensions: { codigo: 'VALIDACION_FALLIDA' } });
    expect(details(short)).toEqual([{ campo: 'titulo', regla: 'minimo_caracteres', mensaje: 'Debe tener al menos 5 caracteres.' }]);
    expect(details(await check('x'.repeat(121)))).toEqual([{ campo: 'titulo', regla: 'maximo_caracteres', mensaje: 'Debe tener como máximo 120 caracteres.' }]);
    expect(details(await check('   '))).toEqual([{ campo: 'titulo', regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' }]);
    expect(details(await check(''))).toEqual([{ campo: 'titulo', regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' }]);
    expect(details(await check('Hola\u0007 mundo'))?.[0]).toMatchObject({ campo: 'titulo', mensaje: 'No puede tener caracteres de control.' });
    expect((await check('x'.repeat(120))).errors).toBeUndefined(); // el límite exacto pasa
  });

  it('los argumentos de más o faltantes se rechazan antes de ejecutar (400 SOLICITUD_INVALIDA) y no crean nada', async () => {
    const extra = await gql(app, 'mutation { crear_curso(titulo: "Un curso nuevo", slug: "mio") { id } }', {}, instructor.token).expect(400);
    expect((extra.body as { error: { codigo: string } }).error.codigo).toBe('SOLICITUD_INVALIDA');
    const missing = await gql(app, 'mutation { crear_curso { id } }', {}, instructor.token).expect(400);
    expect((missing.body as { error: { codigo: string } }).error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(sql(`select count(*) from escuela.cursos where slug like 'un-curso-nuevo%'`)).toBe('0');
  });
});

describe('editar_curso', () => {
  let course: Created;
  beforeAll(async () => {
    course = await createCourse(instructor, `ZZ E2E Edición ${TAG}`);
  });
  const edit = (variables: Record<string, unknown>, token = instructor.token) => run(app, EDITAR, { c: course.id, ...variables }, token);

  it('el dueño cambia solo los campos enviados y el slug no cambia', async () => {
    const categoryId = Number(sql('select id from escuela.categorias order by id limit 1'));
    const body = await edit({
      t: `  ZZ E2E Edición nueva ${TAG} `,
      s: 'Un subtítulo',
      d: 'Línea 1\nLínea 2',
      p: 'Saber sumar',
      l: ['  Anatomía  ', 'Fisiología'],
      n: 'intermedio',
      k: categoryId,
    });
    expect(body).toEqual({ data: { editar_curso: { id: course.id } } });
    expect(dbCourse(course.id, `titulo || '|' || subtitulo || '|' || replace(descripcion, E'\\n', '/') || '|' || conocimientos_previos || '|' || nivel || '|' || categoria_id || '|' || slug`)).toBe(
      `ZZ E2E Edición nueva ${TAG}|Un subtítulo|Línea 1/Línea 2|Saber sumar|intermedio|${categoryId}|${course.slug}`,
    );
    expect(dbCourse(course.id, 'lo_que_aprenderas')).toBe('{Anatomía,Fisiología}');
    // solo el subtítulo: lo demás se conserva
    await edit({ s: 'Otro subtítulo' });
    expect(dbCourse(course.id, `subtitulo || '|' || nivel || '|' || array_to_string(lo_que_aprenderas, ',')`)).toBe('Otro subtítulo|intermedio|Anatomía,Fisiología');
  });

  it('un valor vacío borra el campo, salvo el título, que se conserva; y toca actualizado_en', async () => {
    sql(`update escuela.cursos set actualizado_en = now() - interval '1 hour' where id = ${course.id}`);
    expect((await edit({ s: '', n: null, l: [], t: null })).errors).toBeUndefined();
    expect(dbCourse(course.id, `coalesce(subtitulo, '<null>') || '|' || coalesce(nivel, '<null>') || '|' || cardinality(lo_que_aprenderas) || '|' || (titulo like 'ZZ E2E Edición nueva%')`)).toBe('<null>|<null>|0|true');
    expect(dbCourse(course.id, `actualizado_en > now() - interval '1 minute'`)).toBe('t');
  });

  it('valida cada campo con los límites del workflow y junta todos los errores', async () => {
    const body = await edit({ t: 'abc', s: 'x'.repeat(201), d: 'x'.repeat(5001), p: 'x'.repeat(2001), n: 'experto', k: 32001 });
    expect(details(body)?.map((d) => `${d.campo}:${d.regla}`).sort()).toEqual(
      ['categoria_id:valor_maximo', 'conocimientos_previos:maximo_caracteres', 'descripcion:maximo_caracteres', 'nivel:valor_no_permitido', 'subtitulo:maximo_caracteres', 'titulo:minimo_caracteres'].sort(),
    );
    expect(details(await edit({ n: 'experto' }))).toEqual([{ campo: 'nivel', regla: 'valor_no_permitido', mensaje: 'Debe ser uno de: basico, intermedio, avanzado.' }]);
    expect(details(await edit({ l: Array.from({ length: 11 }, (_, i) => `punto ${i}`) }))).toEqual([
      { campo: 'lo_que_aprenderas', regla: 'maximo_elementos', mensaje: 'Puede tener como máximo 10 elementos.' },
    ]);
    expect(details(await edit({ l: ['ok', 'x'.repeat(151)] }))).toEqual([
      { campo: 'lo_que_aprenderas', regla: 'elemento_invalido', mensaje: 'Cada elemento debe ser un texto de 1 a 150 caracteres.' },
    ]);
    expect(details(await edit({ l: ['ok', '   '] }))?.[0].regla).toBe('elemento_invalido');
    expect(details(await edit({ k: 0 }))).toEqual([{ campo: 'categoria_id', regla: 'valor_minimo', mensaje: 'Debe ser al menos 1.' }]);
    expect(details(await run(app, EDITAR, { c: 9007199254741 }, instructor.token))).toEqual([
      { campo: 'curso_id', regla: 'valor_maximo', mensaje: 'Debe ser como máximo 9007199254740.' },
    ]);
    expect(details(await run(app, EDITAR, { c: 0 }, instructor.token))?.[0]).toMatchObject({ campo: 'curso_id', regla: 'valor_minimo' });
    expect((await edit({ l: Array.from({ length: 10 }, (_, i) => `p${i}`), d: 'x'.repeat(5000) })).errors).toBeUndefined(); // límites exactos
  });

  it('una categoría que no existe da VALIDACION_FALLIDA con categoria_inexistente y no cambia nada', async () => {
    const body = await edit({ k: 31999, s: 'No debe guardarse' });
    expect(details(body)).toEqual([{ campo: 'categoria_id', regla: 'categoria_inexistente', mensaje: 'La categoría no existe.' }]);
    expect(dbCourse(course.id, `coalesce(subtitulo, '<null>')`)).not.toBe('No debe guardarse');
  });

  it('un curso inexistente da NO_ENCONTRADO "El curso no existe."', async () => {
    const body = await run(app, EDITAR, { c: 9007199254740, t: 'Un título nuevo' }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('un curso ajeno da SIN_PERMISO (otro instructor y el equipo de apoyo) y no cambia nada', async () => {
    for (const account of [other, member, plain]) {
      const body = await edit({ t: 'Título de un intruso' }, account.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
    }
    expect(dbCourse(course.id, 'titulo')).not.toBe('Título de un intruso');
  });

  it('un curso en revisión rechaza la edición con CURSO_EN_REVISION y un publicado sí se edita', async () => {
    setStatus(course.id, 'en_revision');
    const body = await edit({ t: 'Título en revisión' });
    expect(body.errors?.[0]).toMatchObject({ message: 'El curso está en revisión y no se puede editar.', extensions: { codigo: 'CURSO_EN_REVISION' } });
    expect(dbCourse(course.id, 'titulo')).not.toBe('Título en revisión');
    setStatus(course.id, 'publicado');
    expect((await edit({ t: `ZZ E2E Publicado ${TAG}` })).errors).toBeUndefined();
    expect(dbCourse(course.id, 'titulo')).toBe(`ZZ E2E Publicado ${TAG}`);
    expect(dbCourse(course.id, 'estado')).toBe('publicado');
  });

  it('el campo slug no existe en la mutación (se rechaza antes de ejecutar)', async () => {
    const res = await gql(app, `mutation { editar_curso(curso_id: ${course.id}, slug: "otro") { id } }`, {}, instructor.token).expect(400);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(dbCourse(course.id, 'slug')).toBe(course.slug);
  });
});

describe('mis_cursos', () => {
  it('el instructor ve los suyos, el equipo ve los del instructor (es_mio false) y los demás no ven ajenos', async () => {
    const mine = await createCourse(instructor, `ZZ E2E Listado ${TAG}`);
    const otherCourse = await createCourse(other, `ZZ E2E Listado ajeno ${TAG}`);
    setStatus(mine.id, 'en_revision');
    sql(`update escuela.cursos set comentario_revision = 'Falta portada' where id = ${mine.id}`);

    const own = (await run(app, MIS_CURSOS, {}, instructor.token)).data?.mis_cursos as { id: number; slug: string; estado: string; es_mio: boolean; instructor: string; comentario_revision: string | null; actualizado_en: string }[];
    expect(own.map((c) => c.id)).toContain(mine.id);
    expect(own.map((c) => c.id)).not.toContain(otherCourse.id);
    expect(own.every((c) => c.es_mio)).toBe(true);
    expect(own.find((c) => c.id === mine.id)).toMatchObject({ estado: 'en_revision', comentario_revision: 'Falta portada', instructor: 'Instructor e2e', es_mio: true });
    // del más reciente al más viejo
    const times = own.map((c) => Date.parse(c.actualizado_en));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(own.length).toBe(Number(sql(`select count(*) from escuela.cursos where instructor_id = '${instructor.id}'`)));

    const team = (await run(app, MIS_CURSOS, {}, member.token)).data?.mis_cursos as { id: number; es_mio: boolean }[];
    expect(team.map((c) => c.id).sort()).toEqual(own.map((c) => c.id).sort());
    expect(team.every((c) => !c.es_mio)).toBe(true);

    const theirs = (await run(app, MIS_CURSOS, {}, other.token)).data?.mis_cursos as { id: number }[];
    expect(theirs.map((c) => c.id)).toContain(otherCourse.id);
    expect(theirs.map((c) => c.id)).not.toContain(mine.id);
  });

  it('un usuario sin rol recibe SIN_PERMISO', async () => {
    expect(code(await run(app, MIS_CURSOS, {}, plain.token))).toBe('SIN_PERMISO');
  });
});

describe('curso_edicion', () => {
  let course: Created;
  let lessonWithVideos: number;
  let lessonPlain: number;
  const KEY_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  beforeAll(async () => {
    course = await createCourse(instructor, `ZZ E2E Editor ${TAG}`);
    const s1 = sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${course.id}, 'Sección 1', 1) returning id`);
    sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${course.id}, 'Sección vacía', 2)`);
    lessonWithVideos = Number(sql(`insert into escuela.clases (seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion) values (${s1}, 'Clase con video', 'Una clase', 12, true, 1) returning id`));
    lessonPlain = Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion) values (${s1}, 'Clase sin video', 2) returning id`));
    const base = `cursos/${course.id}/secciones/${s1}/clases/${lessonWithVideos}`;
    const current = sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base) values (${lessonWithVideos}, 'listo', true, 'a.mp4', 'video/mp4', 1000, 95, '${base}/1') returning id`);
    sql(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, ruta_base, error) values (${lessonWithVideos}, 'error', false, 'b.mp4', 'video/mp4', 1000, '${base}/2', 'El archivo no es un video válido.')`);
    sql(`insert into escuela.claves_video (video_id, clave) values (${current}, decode('${KEY_HEX}', 'hex'))`);
  });

  it('el dueño recibe el curso completo con temario, es_dueno true y video y video_nuevo por clase', async () => {
    const body = await run(app, EDICION, { id: course.id }, instructor.token);
    expect(body.errors).toBeUndefined();
    const data = body.data?.curso_edicion as { id: number; slug: string; es_dueno: boolean; estado: string; lo_que_aprenderas: string[]; secciones: { titulo: string; posicion: number; clases: Record<string, unknown>[] }[] };
    expect(data).toMatchObject({ id: course.id, slug: course.slug, es_dueno: true, estado: 'borrador', lo_que_aprenderas: [], subtitulo: null, nivel: null, categoria_id: null });
    expect(data.secciones.map((s) => [s.titulo, s.posicion, s.clases.length])).toEqual([['Sección 1', 1, 2], ['Sección vacía', 2, 0]]);
    const [withVideos, plainLesson] = data.secciones[0].clases;
    expect(withVideos).toMatchObject({
      titulo: 'Clase con video', descripcion: 'Una clase', duracion_estimada_minutos: 12, es_muestra: true, posicion: 1,
      video: { estado: 'listo', duracion_segundos: 95 },
      video_nuevo: { id: expect.any(Number), estado: 'error', error: 'El archivo no es un video válido.' },
    });
    expect(plainLesson).toMatchObject({ titulo: 'Clase sin video', descripcion: null, duracion_estimada_minutos: null, es_muestra: false, posicion: 2, video: null, video_nuevo: null });
    expect(withVideos.id).toBe(lessonWithVideos);
    expect(plainLesson.id).toBe(lessonPlain);
  });

  it('nunca devuelve la clave de cifrado: ni su valor ni un campo para pedirla', async () => {
    const res = await gql(app, EDICION, { id: course.id }, instructor.token).expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${KEY_HEX}|clave|calve`, 'i'));
    expect(JSON.stringify(res.body)).not.toMatch(/\\\\x[0-9a-f]{32}/i);
    const ask = await gql(app, `{ curso_edicion(id: ${course.id}) { secciones { clases { video { clave clave_hex } } } } }`, {}, instructor.token).expect(400);
    expect((ask.body as { error: { codigo: string } }).error.codigo).toBe('SOLICITUD_INVALIDA');
    const schema = await gql(app, '{ __schema { types { name fields { name } } } }').expect(200);
    expect(JSON.stringify(schema.body)).not.toMatch(/clave|claves_video/i);
  });

  it('el equipo de apoyo lo lee con es_dueno false; otro instructor y un usuario sin rol reciben SIN_PERMISO', async () => {
    const asMember = await run(app, EDICION, { id: course.id }, member.token);
    expect(asMember.errors).toBeUndefined();
    expect((asMember.data?.curso_edicion as { es_dueno: boolean }).es_dueno).toBe(false);
    expect(code(await run(app, EDICION, { id: course.id }, other.token))).toBe('SIN_PERMISO');
    expect(code(await run(app, EDICION, { id: course.id }, plain.token))).toBe('SIN_PERMISO');
  });

  it('un curso en revisión se puede leer; uno inexistente da NO_ENCONTRADO; un id fuera de rango, VALIDACION_FALLIDA', async () => {
    setStatus(course.id, 'en_revision');
    expect((await run(app, EDICION, { id: course.id }, instructor.token)).errors).toBeUndefined();
    setStatus(course.id, 'borrador');
    const missing = await run(app, EDICION, { id: 9007199254740 }, instructor.token);
    expect(missing.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(details(await run(app, EDICION, { id: 0 }, instructor.token))).toEqual([{ campo: 'id', regla: 'valor_minimo', mensaje: 'Debe ser al menos 1.' }]);
  });
});

describe('costo de la consulta del editor', () => {
  it('un curso grande (10 secciones x 30 clases) se pide completo y queda por debajo del costo máximo', async () => {
    const big = await createCourse(instructor, `ZZ E2E Grande ${TAG}`);
    sql(`
      insert into escuela.secciones (curso_id, titulo, posicion) select ${big.id}, 'S' || n, n from generate_series(1, 10) n;
      insert into escuela.clases (seccion_id, titulo, posicion)
        select s.id, 'C' || k, k from escuela.secciones s, generate_series(1, 30) k where s.curso_id = ${big.id};`);
    const res = await gql(app, EDICION, { id: big.id }, instructor.token).expect(200);
    const data = (res.body as GqlBody).data?.curso_edicion as { secciones: { clases: unknown[] }[] };
    expect(data.secciones.map((s) => s.clases.length)).toEqual(Array(10).fill(30));
  });

  it('pedir listas anidadas varias veces en una consulta se rechaza con 400 CONSULTA_DEMASIADO_COMPLEJA', async () => {
    const part = (alias: string) => `${alias}: curso_edicion(id: 1) { id secciones { id titulo clases { id titulo video { estado } } } }`;
    const res = await gql(app, `{ ${part('a')} ${part('b')} ${part('c')} }`, {}, instructor.token).expect(400);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
  });
});
