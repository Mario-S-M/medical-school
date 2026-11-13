import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { cleanup, sql } from './helpers/real-env';
import { startSchool } from './helpers/start-school';
import { Account, code, courseCount, giveRole, gql, newAccount, removeAccountResidue, run } from './helpers/school-gql';

// SPEC 10, paso 4: catálogo público (`cursos`, `curso`, `categorias`) sin token. La app corre EN PROCESO (modo desarrollo)
// contra el stack real. Cada prueba limpia su residuo (cursos `zz-e2e-*`, cuentas, perfiles); los datos copiados no se tocan.

let app: NestFastifyApplication;
const userIds: string[] = [];
const TAG = `zzcat${process.pid}`; // palabra única que solo llevan los cursos de esta suite
const INSTRUCTOR_NAME = `Zzdoctora${process.pid} Villanueva`;

const CURSOS = `query($q: String, $c: String, $n: String, $p: Int) { cursos(q: $q, categoria: $c, nivel: $n, pagina: $p) {
  total pagina paginas cursos { slug titulo subtitulo nivel categoria categoria_slug instructor portada_ruta secciones clases } } }`;
const CURSO = `query($s: String!) { curso(slug: $s) {
  id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria { nombre slug } portada_ruta instructor publicado_en
  secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion } } } }`;

interface Card {
  slug: string;
  titulo: string;
  subtitulo: string | null;
  nivel: string | null;
  categoria: string | null;
  categoria_slug: string | null;
  instructor: string;
  portada_ruta: string | null;
  secciones: number;
  clases: number;
}
interface Page {
  total: number;
  pagina: number;
  paginas: number;
  cursos: Card[];
}
const list = async (variables: Record<string, unknown>): Promise<Page> => {
  const body = await run(app, CURSOS, variables);
  expect(body.errors).toBeUndefined();
  return (body.data as { cursos: Page }).cursos;
};
const slugs = (page: Page): string[] => page.cursos.map((c) => c.slug);

let instructor: Account;
let before = 0;
let categoryId = 0;
let categorySlug = '';
let anatomyId = 0;
const slugOf = (key: string): string => `zz-e2e-${key}-${process.pid}`;

function insertCourse(key: string, title: string, status: 'borrador' | 'en_revision' | 'publicado', level: string | null, category: number | null): number {
  const published = status === 'publicado' ? 'now()' : 'null';
  const levelSql = level ? `'${level}'` : 'null';
  return Number(
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, subtitulo, descripcion, nivel, categoria_id, estado, publicado_en)
         values ('${slugOf(key)}', '${instructor.id}', '${title}', 'Subtítulo de ${key}', 'Descripción de ${key}', ${levelSql}, ${category ?? 'null'}, '${status}', ${published}) returning id`),
  );
}

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  sql(`delete from escuela.categorias where slug like 'zz-e2e-cat-%'`);
  before = courseCount();
  app = await startSchool();
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  sql(`update escuela.perfiles_instructor set nombre_publico = '${INSTRUCTOR_NAME}' where usuario_id = '${instructor.id}'`);
  // categoría propia: así el filtro por categoría reduce el resultado aunque en los datos copiados todo esté en una sola
  categorySlug = `zz-e2e-cat-${process.pid}`;
  categoryId = Number(sql(`insert into escuela.categorias (nombre, slug, posicion) values ('ZZ E2E Categoría ${process.pid}', '${categorySlug}', 999) returning id`));
  // "Anatomía básica" (nivel basico, con categoría) y un curso por estado no público con la misma palabra clave.
  anatomyId = insertCourse('anatomia', `Anatomía básica ${TAG}`, 'publicado', 'basico', categoryId);
  const section = sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${anatomyId}, 'Huesos', 1) returning id`);
  sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${anatomyId}, 'Músculos', 2)`);
  sql(`insert into escuela.clases (seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion) values (${section}, 'El cráneo', 'Clase 1', 15, true, 1), (${section}, 'La columna', null, null, false, 2)`);
  insertCourse('borrador', `Curso borrador ${TAG}`, 'borrador', 'avanzado', null);
  insertCourse('revision', `Curso en revisión ${TAG}`, 'en_revision', 'avanzado', null);
});
afterAll(async () => {
  await app.close();
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  sql(`delete from escuela.categorias where slug like 'zz-e2e-cat-%'`);
  removeAccountResidue(userIds);
  cleanup();
  expect(courseCount()).toBe(before); // no queda ningún curso de prueba y los datos copiados siguen intactos
});

describe('operaciones públicas (sin token)', () => {
  it('cursos, curso y categorias responden con datos sin Authorization', async () => {
    const page = await list({});
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.pagina).toBe(1);
    const ficha = await run(app, CURSO, { s: slugOf('anatomia') });
    expect(ficha.errors).toBeUndefined();
    const categories = await run(app, '{ categorias { id nombre slug posicion } }', {});
    expect(categories.errors).toBeUndefined();
    expect((categories.data as { categorias: unknown[] }).categorias.length).toBeGreaterThan(0);
  });

  it('con un token no válido, una consulta pública igual responde (no exige sesión)', async () => {
    const body = await run(app, CURSOS, {}, 'no-es-un-token');
    expect(body.errors).toBeUndefined();
  });

  it('el límite de peticiones por IP sí aplica: la 121 da 429', async () => {
    const ip = '198.18.77.7';
    const send = () => request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', ip).send({ query: '{ cursos { total } }' });
    for (let i = 0; i < 120; i++) await send().expect(200);
    const blocked = await send().expect(429);
    expect((blocked.body as { error: { codigo: string } }).error.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });
});

describe('búsqueda', () => {
  it.each([TAG, TAG.toUpperCase(), 'anatomia', 'ANATOMÍA', 'Anatomía básica', 'anatomia basica'])('"%s" encuentra el curso "Anatomía básica"', async (q) => {
    const page = await list({ q });
    expect(slugs(page)).toContain(slugOf('anatomia'));
  });

  it('encuentra por el nombre del instructor, con o sin acentos y mayúsculas', async () => {
    for (const q of [`Zzdoctora${process.pid}`, `ZZDÓCTORA${process.pid} villanueva`, 'Villanueva ' + `zzdoctora${process.pid}`]) {
      const page = await list({ q });
      expect(slugs(page)).toEqual([slugOf('anatomia')]);
      expect(page.cursos[0].instructor).toBe(INSTRUCTOR_NAME);
    }
  });

  it('una búsqueda sin coincidencias da total 0, 0 páginas y lista vacía', async () => {
    expect(await list({ q: 'zzninguncursoconesto' })).toEqual({ total: 0, pagina: 1, paginas: 0, cursos: [] });
  });

  it('la tarjeta trae los campos del contrato y las cuentas de secciones y clases', async () => {
    const [card] = (await list({ q: TAG })).cursos;
    expect(card).toEqual({
      slug: slugOf('anatomia'),
      titulo: `Anatomía básica ${TAG}`,
      subtitulo: 'Subtítulo de anatomia',
      nivel: 'basico',
      categoria: `ZZ E2E Categoría ${process.pid}`,
      categoria_slug: categorySlug,
      instructor: INSTRUCTOR_NAME,
      portada_ruta: null,
      secciones: 2,
      clases: 2,
    });
  });
});

describe('filtros', () => {
  it('los filtros de categoría (slug) y nivel reducen el resultado', async () => {
    const all = await list({});
    const byCategory = await list({ c: categorySlug });
    const byLevel = await list({ n: 'avanzado' });
    expect(byCategory.total).toBeLessThan(all.total);
    expect(slugs(byCategory)).toContain(slugOf('anatomia'));
    expect(slugs(byLevel)).not.toContain(slugOf('anatomia'));
    expect(byLevel.total).toBeLessThan(all.total);
    expect((await list({ q: TAG, n: 'basico' })).total).toBe(1);
    expect((await list({ q: TAG, n: 'intermedio' })).total).toBe(0);
    expect((await list({ q: TAG, c: categorySlug, n: 'basico' })).total).toBe(1);
    expect((await list({ c: 'no-existe-esta-categoria' })).total).toBe(0);
  });

  it('los defaults valen: sin parámetros es la página 1 y "" cuenta como no enviado', async () => {
    const plain = await list({});
    expect(await list({ q: '', c: '', n: '', p: null })).toEqual(plain);
    expect(plain.cursos.length).toBeLessThanOrEqual(12);
  });
});

describe('validación (mismas reglas que el workflow)', () => {
  it.each([
    [{ q: 'x'.repeat(101) }, 'q', 'maximo_caracteres'],
    [{ c: 'x'.repeat(81) }, 'categoria', 'maximo_caracteres'],
    [{ n: 'experto' }, 'nivel', 'valor_no_permitido'],
    [{ p: 0 }, 'pagina', 'valor_minimo'],
    [{ p: 10001 }, 'pagina', 'valor_maximo'],
  ])('%j da VALIDACION_FALLIDA con el campo %s', async (variables, field, rule) => {
    const body = await run(app, CURSOS, variables);
    expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: field, regla: rule })]);
  });

  it('el límite justo (q de 100, página 10000) se acepta y una página lejana da lista vacía con el total real', async () => {
    expect((await list({ q: 'x'.repeat(100) })).total).toBe(0);
    const far = await list({ p: 10000 });
    expect(far.cursos).toEqual([]);
    expect(far.pagina).toBe(10000);
    expect(far.total).toBeGreaterThan(0);
  });

  it('un slug vacío o de 121 caracteres da VALIDACION_FALLIDA', async () => {
    expect((await run(app, CURSO, { s: '' })).errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect((await run(app, CURSO, { s: 'x'.repeat(121) })).errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
  });
});

describe('paginación', () => {
  it('con 13 cursos publicados hay 2 páginas: 12 y 1, sin repetir ninguno', async () => {
    const created = Array.from({ length: 12 }, (_, i) => insertCourse(`lote${i}`, `Curso de lote ${i} ${TAG}lote`, 'publicado', 'intermedio', null));
    expect(created).toHaveLength(12);
    // el curso de anatomía suma el 13º con la misma palabra clave en su título
    sql(`update escuela.cursos set titulo = titulo || ' ${TAG}lote' where id = ${anatomyId}`);
    const first = await list({ q: `${TAG}lote`, p: 1 });
    const second = await list({ q: `${TAG}lote`, p: 2 });
    expect(first).toMatchObject({ total: 13, pagina: 1, paginas: 2 });
    expect(first.cursos).toHaveLength(12);
    expect(second).toMatchObject({ total: 13, pagina: 2, paginas: 2 });
    expect(second.cursos).toHaveLength(1);
    expect(new Set([...slugs(first), ...slugs(second)]).size).toBe(13);
    expect((await list({ q: `${TAG}lote`, p: 3 })).cursos).toEqual([]);
  });
});

describe('solo cursos publicados', () => {
  it('un borrador y un curso en revisión no aparecen en el catálogo ni en la búsqueda', async () => {
    const page = await list({ q: TAG });
    expect(slugs(page)).not.toContain(slugOf('borrador'));
    expect(slugs(page)).not.toContain(slugOf('revision'));
    expect((await list({ n: 'avanzado', q: TAG })).total).toBe(0);
  });

  it('su ficha da NO_ENCONTRADO "El curso no existe." igual que un slug inexistente', async () => {
    for (const key of ['borrador', 'revision']) {
      const body = await run(app, CURSO, { s: slugOf(key) });
      expect(body.data).toBeNull();
      expect(body.errors?.[0]).toMatchObject({ message: 'El curso no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    }
    expect(code(await run(app, CURSO, { s: 'no-existe-este-slug' }))).toBe('NO_ENCONTRADO');
  });

  it('al pasar un curso a publicado aparece y al volver a borrador desaparece', async () => {
    const id = insertCourse('cambia', `Curso cambiante ${TAG}x`, 'borrador', null, null);
    expect((await list({ q: `${TAG}x` })).total).toBe(0);
    sql(`update escuela.cursos set estado = 'publicado', publicado_en = now() where id = ${id}`);
    expect((await list({ q: `${TAG}x` })).total).toBe(1);
    sql(`update escuela.cursos set estado = 'borrador' where id = ${id}`);
    expect((await list({ q: `${TAG}x` })).total).toBe(0);
  });
});

describe('ficha del curso', () => {
  it('trae el temario en orden con las clases y sus campos públicos', async () => {
    const body = await run(app, CURSO, { s: slugOf('anatomia') });
    const ficha = (body.data as { curso: Record<string, unknown> & { secciones: { titulo: string; posicion: number; clases: Record<string, unknown>[] }[] } }).curso;
    expect(ficha).toMatchObject({
      id: anatomyId,
      slug: slugOf('anatomia'),
      titulo: expect.stringContaining('Anatomía básica'),
      descripcion: 'Descripción de anatomia',
      nivel: 'basico',
      categoria: { slug: categorySlug },
      portada_ruta: null,
      instructor: INSTRUCTOR_NAME,
      lo_que_aprenderas: [],
    });
    expect(typeof ficha.publicado_en).toBe('string');
    expect(ficha.secciones.map((s) => [s.titulo, s.posicion, s.clases.length])).toEqual([['Huesos', 1, 2], ['Músculos', 2, 0]]);
    expect(ficha.secciones[0].clases).toEqual([
      expect.objectContaining({ titulo: 'El cráneo', descripcion: 'Clase 1', duracion_estimada_minutos: 15, es_muestra: true, posicion: 1 }),
      expect.objectContaining({ titulo: 'La columna', descripcion: null, duracion_estimada_minutos: null, es_muestra: false, posicion: 2 }),
    ]);
  });

  it('no contiene campos internos: ni en la respuesta ni en el esquema (introspección)', async () => {
    const body = await run(app, CURSO, { s: slugOf('anatomia') });
    expect(JSON.stringify(body)).not.toMatch(/instructor_id|comentario_revision|"estado"|correo|@|clave|video/i);
    const forbidden = /instructor_id|comentario_revision|^estado$|correo|email|clave|video|usuario/i;
    const intro = await run(
      app,
      `{ a: __type(name: "FichaCurso") { fields { name } } b: __type(name: "TarjetaCurso") { fields { name } } c: __type(name: "SeccionTemario") { fields { name } }
         d: __type(name: "ClaseTemario") { fields { name } } e: __type(name: "CategoriaFicha") { fields { name } } f: __type(name: "PaginaCursos") { fields { name } } }`,
      {},
    );
    const types = Object.values(intro.data as Record<string, { fields: { name: string }[] }>);
    expect(types).toHaveLength(6);
    for (const type of types) {
      expect(type.fields.length).toBeGreaterThan(0);
      for (const field of type.fields) expect(field.name).not.toMatch(forbidden);
    }
  });

  it('pedir un campo interno (instructor_id, estado) falla por campo desconocido', async () => {
    for (const field of ['instructor_id', 'estado', 'comentario_revision']) {
      const res = await gql(app, `{ curso(slug: "${slugOf('anatomia')}") { ${field} } }`).expect(400);
      expect((res.body as { errors: { extensions: { codigo: string } }[] }).errors[0].extensions.codigo).toBe('SOLICITUD_INVALIDA');
    }
  });
});

describe('costo de la consulta', () => {
  it('una página de 12 tarjetas y la ficha con secciones y clases caben en el límite de 1000', async () => {
    const wide = `{ cursos { total pagina paginas cursos { slug titulo subtitulo nivel categoria categoria_slug instructor portada_ruta secciones clases } }
      categorias { id nombre slug posicion } }`;
    expect((await run(app, wide, {})).errors).toBeUndefined();
    expect((await run(app, CURSO, { s: slugOf('anatomia') })).errors).toBeUndefined();
  });

  it('pedir la ficha de varios cursos en una sola consulta (alias) se rechaza con 400 CONSULTA_DEMASIADO_COMPLEJA', async () => {
    const heavy = (alias: string) => `${alias}: curso(slug: "x") { id secciones { id clases { id } } }`;
    const res = await request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', '198.18.78.8').send({ query: `{ ${heavy('a')} ${heavy('b')} }` });
    expect(res.status).toBe(400);
    expect((res.body as { error: { codigo: string } }).error.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
  });
});

describe('un curso nuevo del instructor se publica solo tras aprobarse', () => {
  it('el nombre del instructor sin perfil se muestra como "Instructor"', async () => {
    const id = insertCourse('huerfano', `Curso sin perfil ${TAG}p`, 'publicado', null, null);
    sql(`update escuela.cursos set instructor_id = gen_random_uuid() where id = ${id}`);
    const [card] = (await list({ q: `${TAG}p` })).cursos;
    expect(card.instructor).toBe('Instructor');
    const ficha = await run(app, CURSO, { s: slugOf('huerfano') });
    expect((ficha.data as { curso: { instructor: string } }).curso.instructor).toBe('Instructor');
  });
});
