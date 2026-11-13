import { execFileSync } from 'node:child_process';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { cleanup, createUser, newIp, Person, REPO_ROOT, signIn, sql } from './helpers/real-env';
import { startSchool } from './helpers/start-school';

// SPEC 10, paso 2: roles desde la base, categorías y administración de cuentas. La app corre EN PROCESO (modo desarrollo)
// contra el stack real: login real de usuarios de prueba, base `plataforma` y API admin de Supabase Auth.
// Cada prueba limpia su residuo (usuarios, roles, perfiles, categorías de prueba); los datos copiados no se tocan.

const CATEGORY_PREFIX = 'zz e2e'; // slug `zz-e2e-...`
const CATEGORY_SLUGS = `slug like 'zz-e2e-%'`;

let app: NestFastifyApplication;
const userIds: string[] = [];
const MIS_ROLES = '{ mis_roles { roles equipos { instructor_id nombre_publico } } }';
const CATEGORIAS = '{ categorias { id nombre slug posicion } }';
const BUSCAR = 'query($correo: String!) { buscar_usuario(correo: $correo) { id correo nombre verificado roles } }';
const ASIGNAR = 'mutation($u: ID!, $r: String!, $a: Boolean!) { asignar_rol(usuario_id: $u, rol: $r, activo: $a) { usuario_id rol activo } }';
const GUARDAR = 'mutation($id: Int, $n: String!, $p: Int!) { guardar_categoria(id: $id, nombre: $n, posicion: $p) { id } }';
const BORRAR = 'mutation($id: Int!) { borrar_categoria(id: $id) { ok } }';

interface GqlBody {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions: { codigo: string; detalles?: { campo: string; regla: string; mensaje: string }[] } }[];
}

function gql(query: string, variables: Record<string, unknown> = {}, token?: string) {
  const r = request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', newIp());
  if (token) r.set('Authorization', `Bearer ${token}`);
  return r.send({ query, variables });
}
async function run(query: string, variables: Record<string, unknown>, token?: string): Promise<GqlBody> {
  return (await gql(query, variables, token).expect(200)).body as GqlBody;
}
const code = (body: GqlBody): string | undefined => body.errors?.[0]?.extensions.codigo;

interface Account {
  person: Person;
  token: string;
  id: string;
}
async function newAccount(): Promise<Account> {
  const person = await createUser(true);
  const token = (await signIn(person, person.contrasena).expect(200)).body.token_acceso as string;
  const id = (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
  userIds.push(id);
  return { person, token, id };
}
function makeAdmin(id: string): void {
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${id}', 'administrador') on conflict do nothing`);
}
const rolesInDb = (id: string): string => sql(`select coalesce(string_agg(rol, ',' order by rol), '') from escuela.roles_usuario where usuario_id = '${id}'`);
const categoryCount = (): number => Number(sql('select count(*) from escuela.categorias'));

function removeResidue(): void {
  for (const id of userIds) {
    sql(`delete from escuela.equipos_apoyo where instructor_id = '${id}' or miembro_id = '${id}'`);
    sql(`delete from escuela.roles_usuario where usuario_id = '${id}'`);
    sql(`delete from escuela.perfiles_instructor where usuario_id = '${id}'`);
  }
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  sql(`delete from escuela.categorias where ${CATEGORY_SLUGS}`);
  cleanup();
}

let before = 0;
let admin: Account;
let plain: Account;

beforeAll(async () => {
  removeResidue();
  before = categoryCount();
  app = await startSchool();
  admin = await newAccount();
  makeAdmin(admin.id);
  plain = await newAccount();
});
afterAll(async () => {
  await app.close();
  removeResidue();
  expect(categoryCount()).toBe(before); // no queda ninguna categoría de prueba y los datos copiados siguen intactos
});

describe('sin token', () => {
  it('categorias es pública y trae las categorías ordenadas con { id, nombre, slug, posicion }', async () => {
    // Crea sus propias categorías: no depende de que la base ya tenga alguna.
    sql(`insert into escuela.categorias (nombre, slug, posicion) values ('zz-e2e Pública B', 'zz-e2e-publica-b', 9001), ('zz-e2e Pública A', 'zz-e2e-publica-a', 9000)`);
    try {
      const body = await run(CATEGORIAS, {});
      const list = body.data?.categorias as { id: number; nombre: string; slug: string; posicion: number }[];
      expect(body.errors).toBeUndefined();
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.filter((c) => c.nombre.startsWith('zz-e2e')).map((c) => c.nombre)).toEqual(['zz-e2e Pública A', 'zz-e2e Pública B']);
      checkOrdered(list);
    } finally {
      sql(`delete from escuela.categorias where slug like 'zz-e2e-publica-%'`);
    }
  });

  function checkOrdered(list: { id: number; nombre: string; slug: string; posicion: number }[]) {
    expect(list[0]).toEqual({ id: expect.any(Number), nombre: expect.any(String), slug: expect.any(String), posicion: expect.any(Number) });
    const positions = list.map((c) => c.posicion);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(list.map((c) => c.id)).toEqual(sql('select id from escuela.categorias order by posicion, nombre').split('\n').map(Number));
  }

  it('las demás operaciones dan TOKEN_INVALIDO', async () => {
    const calls: [string, Record<string, unknown>][] = [
      [MIS_ROLES, {}],
      [BUSCAR, { correo: 'a@b.co' }],
      [ASIGNAR, { u: plain.id, r: 'instructor', a: true }],
      [GUARDAR, { n: 'zz e2e sin token', p: 1 }],
      [BORRAR, { id: 1 }],
    ];
    for (const [query, variables] of calls) expect(code(await run(query, variables))).toBe('TOKEN_INVALIDO');
    expect(code(await run(MIS_ROLES, {}, 'no.es.un-token'))).toBe('TOKEN_INVALIDO');
    expect(sql(`select count(*) from escuela.categorias where ${CATEGORY_SLUGS}`)).toBe('0');
  });
});

describe('usuario sin rol', () => {
  it('mis_roles de un usuario nuevo es { roles: [], equipos: [] }', async () => {
    expect(await run(MIS_ROLES, {}, plain.token)).toEqual({ data: { mis_roles: { roles: [], equipos: [] } } });
  });

  it('buscar_usuario, asignar_rol, guardar_categoria y borrar_categoria dan SIN_PERMISO sin efectos', async () => {
    const calls: [string, Record<string, unknown>][] = [
      [BUSCAR, { correo: plain.person.correo }],
      [ASIGNAR, { u: plain.id, r: 'administrador', a: true }],
      [GUARDAR, { n: 'zz e2e sin permiso', p: 1 }],
      [BORRAR, { id: 1 }],
    ];
    for (const [query, variables] of calls) {
      const body = await run(query, variables, plain.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
      expect(body.data).toBeNull();
    }
    expect(rolesInDb(plain.id)).toBe('');
    expect(sql(`select count(*) from escuela.categorias where ${CATEGORY_SLUGS}`)).toBe('0');
  });

  it('el permiso va antes que la validación: un nombre inválido también da SIN_PERMISO', async () => {
    expect(code(await run(GUARDAR, { n: 'x', p: 0 }, plain.token))).toBe('SIN_PERMISO');
  });

  it('los instructores tampoco son administradores', async () => {
    const instructor = await newAccount();
    sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${instructor.id}', 'instructor')`);
    expect(code(await run(GUARDAR, { n: 'zz e2e instructor', p: 1 }, instructor.token))).toBe('SIN_PERMISO');
  });
});

describe('mis_roles', () => {
  it('un administrador ve su rol', async () => {
    expect(await run(MIS_ROLES, {}, admin.token)).toEqual({ data: { mis_roles: { roles: ['administrador'], equipos: [] } } });
  });

  it('con varios roles salen ordenados y con los equipos de apoyo (nombre_publico del perfil)', async () => {
    const instructor = await newAccount();
    const member = await newAccount();
    sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${instructor.id}', 'instructor'), ('${instructor.id}', 'administrador'), ('${member.id}', 'equipo_apoyo')`);
    sql(`insert into escuela.perfiles_instructor (usuario_id, nombre_publico) values ('${instructor.id}', 'Dra. Prueba')`);
    sql(`insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('${instructor.id}', '${member.id}')`);
    expect(await run(MIS_ROLES, {}, instructor.token)).toEqual({ data: { mis_roles: { roles: ['administrador', 'instructor'], equipos: [] } } });
    expect(await run(MIS_ROLES, {}, member.token)).toEqual({
      data: { mis_roles: { roles: ['equipo_apoyo'], equipos: [{ instructor_id: instructor.id, nombre_publico: 'Dra. Prueba' }] } },
    });
  });
});

describe('buscar_usuario', () => {
  it('encuentra la cuenta por correo (con espacios y mayúsculas) y trae sus roles', async () => {
    const body = await run(BUSCAR, { correo: `  ${plain.person.correo.toUpperCase()} ` }, admin.token);
    expect(body.data).toEqual({ buscar_usuario: { id: plain.id, correo: plain.person.correo, nombre: 'Prueba e2e', verificado: true, roles: [] } });
    const withRole = await run(BUSCAR, { correo: admin.person.correo }, admin.token);
    expect(withRole.data).toMatchObject({ buscar_usuario: { id: admin.id, roles: ['administrador'] } });
  });

  it('un correo sin cuenta (o solo un trozo de uno existente) da NO_ENCONTRADO', async () => {
    for (const correo of ['nadie_zz_e2e@example.com', plain.person.correo.replace('@example.com', '@example.co')]) {
      const body = await run(BUSCAR, { correo }, admin.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'No hay ninguna cuenta con ese correo.', extensions: { codigo: 'NO_ENCONTRADO' } });
    }
  });

  it('un correo mal formado da VALIDACION_FALLIDA con detalles', async () => {
    const body = await run(BUSCAR, { correo: 'no-es-correo' }, admin.token);
    expect(body.errors?.[0].extensions).toEqual({
      codigo: 'VALIDACION_FALLIDA',
      detalles: [{ campo: 'correo', regla: 'formato_correo', mensaje: 'Debe ser un correo válido.' }],
    });
  });
});

describe('asignar_rol', () => {
  it('instructor crea el perfil con el nombre de la cuenta y activo:false quita el rol (el perfil queda)', async () => {
    const target = await newAccount();
    const on = await run(ASIGNAR, { u: target.id, r: 'instructor', a: true }, admin.token);
    expect(on.data).toEqual({ asignar_rol: { usuario_id: target.id, rol: 'instructor', activo: true } });
    expect(rolesInDb(target.id)).toBe('instructor');
    expect(sql(`select nombre_publico || '|' || (select asignado_por = '${admin.id}' from escuela.roles_usuario where usuario_id = '${target.id}') from escuela.perfiles_instructor where usuario_id = '${target.id}'`)).toBe('Prueba e2e|true');
    expect(await run(MIS_ROLES, {}, target.token)).toMatchObject({ data: { mis_roles: { roles: ['instructor'] } } });

    // repetir no duplica y actualiza el nombre público
    sql(`update escuela.perfiles_instructor set nombre_publico = 'Viejo' where usuario_id = '${target.id}'`);
    await run(ASIGNAR, { u: target.id, r: 'instructor', a: true }, admin.token);
    expect(sql(`select count(*) || '|' || max(nombre_publico) from escuela.perfiles_instructor where usuario_id = '${target.id}'`)).toBe('1|Prueba e2e');
    expect(rolesInDb(target.id)).toBe('instructor');

    const off = await run(ASIGNAR, { u: target.id, r: 'instructor', a: false }, admin.token);
    expect(off.data).toEqual({ asignar_rol: { usuario_id: target.id, rol: 'instructor', activo: false } });
    expect(rolesInDb(target.id)).toBe('');
    expect(sql(`select count(*) from escuela.perfiles_instructor where usuario_id = '${target.id}'`)).toBe('1');
    // quitar un rol que no se tiene no es un error
    expect((await run(ASIGNAR, { u: target.id, r: 'instructor', a: false }, admin.token)).errors).toBeUndefined();
  });

  it('administrador se da y se quita; los permisos se leen de la base en cada petición', async () => {
    const target = await newAccount();
    expect(code(await run(GUARDAR, { n: 'zz e2e promovida', p: 1 }, target.token))).toBe('SIN_PERMISO');
    await run(ASIGNAR, { u: target.id, r: 'administrador', a: true }, admin.token);
    expect(rolesInDb(target.id)).toBe('administrador');
    const saved = await run(GUARDAR, { n: 'zz e2e promovida', p: 1 }, target.token); // mismo token, ya es administrador
    expect(saved.errors).toBeUndefined();
    await run(ASIGNAR, { u: target.id, r: 'administrador', a: false }, admin.token);
    expect(code(await run(BORRAR, { id: (saved.data?.guardar_categoria as { id: number }).id }, target.token))).toBe('SIN_PERMISO');
    await run(BORRAR, { id: (saved.data?.guardar_categoria as { id: number }).id }, admin.token);
  });

  it('un administrador no puede quitarse a sí mismo el rol (ESTADO_INVALIDO) pero sí quitárselo a otro', async () => {
    const body = await run(ASIGNAR, { u: admin.id, r: 'administrador', a: false }, admin.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'No puedes quitarte a ti mismo el rol de administrador.', extensions: { codigo: 'ESTADO_INVALIDO' } });
    expect(rolesInDb(admin.id)).toBe('administrador');
    // quitarse instructor a uno mismo sí se permite (la regla es solo del rol de administrador)
    expect((await run(ASIGNAR, { u: admin.id, r: 'instructor', a: false }, admin.token)).errors).toBeUndefined();
  });

  it('una cuenta que no existe da NO_ENCONTRADO y no deja filas', async () => {
    const ghost = '00000000-0000-4000-8000-0000000000e2';
    const body = await run(ASIGNAR, { u: ghost, r: 'instructor', a: true }, admin.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La cuenta no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(sql(`select count(*) from escuela.roles_usuario where usuario_id = '${ghost}'`)).toBe('0');
  });

  it('equipo_apoyo no se asigna a mano y un uuid inválido se rechaza, con detalles', async () => {
    const support = await run(ASIGNAR, { u: plain.id, r: 'equipo_apoyo', a: true }, admin.token);
    expect(support.errors?.[0].extensions).toEqual({
      codigo: 'VALIDACION_FALLIDA',
      detalles: [{ campo: 'rol', regla: 'isin', mensaje: 'Debe ser uno de: instructor, administrador.' }],
    });
    const badId = await run(ASIGNAR, { u: 'no-uuid', r: 'instructor', a: true }, admin.token);
    expect(badId.errors?.[0].extensions.detalles?.[0]).toMatchObject({ campo: 'usuario_id', mensaje: 'Debe ser un identificador válido.' });
    expect(rolesInDb(plain.id)).toBe('');
  });

  it('el nombre público cae al correo si la cuenta no tiene nombre', async () => {
    const target = await newAccount();
    sql(`update auth.users set raw_user_meta_data = '{}'::jsonb where id = '${target.id}'`, 'postgres');
    await run(ASIGNAR, { u: target.id, r: 'instructor', a: true }, admin.token);
    expect(sql(`select nombre_publico from escuela.perfiles_instructor where usuario_id = '${target.id}'`)).toBe(target.person.correo.split('@')[0]);
  });
});

describe('categorias: guardar y borrar', () => {
  const list = async () => ((await run(CATEGORIAS, {})).data?.categorias as { id: number; nombre: string; slug: string; posicion: number }[]).filter((c) => c.slug.startsWith('zz-e2e-'));

  it('crea con slug sin acentos, edita y borra', async () => {
    const created = await run(GUARDAR, { n: `  ${CATEGORY_PREFIX} Fisiología  `, p: 7 }, admin.token);
    const id = (created.data?.guardar_categoria as { id: number }).id;
    expect(id).toEqual(expect.any(Number));
    expect(await list()).toEqual([{ id, nombre: 'zz e2e Fisiología', slug: 'zz-e2e-fisiologia', posicion: 7 }]);

    // renombrar, incluso al mismo nombre, funciona; cambia el slug
    expect((await run(GUARDAR, { id, n: 'zz e2e Fisiología', p: 3 }, admin.token)).data).toEqual({ guardar_categoria: { id } });
    expect((await run(GUARDAR, { id, n: 'zz e2e Neuroanatomía', p: 3 }, admin.token)).data).toEqual({ guardar_categoria: { id } });
    expect(await list()).toEqual([{ id, nombre: 'zz e2e Neuroanatomía', slug: 'zz-e2e-neuroanatomia', posicion: 3 }]);

    expect((await run(BORRAR, { id }, admin.token)).data).toEqual({ borrar_categoria: { ok: true } });
    expect(await list()).toEqual([]);
    expect(code(await run(BORRAR, { id }, admin.token))).toBe('NO_ENCONTRADO'); // ya no existe
  });

  it('CATEGORIA_DUPLICADA: mismo nombre, y nombres que solo difieren en acentos o mayúsculas', async () => {
    const first = await run(GUARDAR, { n: 'zz e2e Anatomía', p: 1 }, admin.token);
    const id = (first.data?.guardar_categoria as { id: number }).id;
    for (const name of ['zz e2e Anatomía', 'ZZ E2E ANATOMÍA', 'zz e2e anatomia', 'zz-e2e--ANATOMIA!']) {
      const body = await run(GUARDAR, { n: name, p: 2 }, admin.token);
      expect(body.errors?.[0]).toMatchObject({ message: 'Ya existe una categoría con ese nombre.', extensions: { codigo: 'CATEGORIA_DUPLICADA' } });
    }
    // renombrar otra a un nombre ya usado también choca
    const other = (await run(GUARDAR, { n: 'zz e2e Histología', p: 2 }, admin.token)).data?.guardar_categoria as { id: number };
    expect(code(await run(GUARDAR, { id: other.id, n: 'zz e2e anatomia', p: 2 }, admin.token))).toBe('CATEGORIA_DUPLICADA');
    expect(await list()).toHaveLength(2);
    await run(BORRAR, { id }, admin.token);
    await run(BORRAR, { id: other.id }, admin.token);
  });

  it('editar una categoría que no existe da NO_ENCONTRADO (aunque el nombre ya esté usado) y no crea nada', async () => {
    const used = (await run(GUARDAR, { n: 'zz e2e Usada', p: 1 }, admin.token)).data?.guardar_categoria as { id: number };
    const body = await run(GUARDAR, { id: 32000, n: 'zz e2e Usada', p: 1 }, admin.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La categoría no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    const missing = await run(BORRAR, { id: 32000 }, admin.token);
    expect(missing.errors?.[0]).toMatchObject({ message: 'La categoría no existe.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(await list()).toHaveLength(1);
    await run(BORRAR, { id: used.id }, admin.token);
  });

  it('CATEGORIA_EN_USO: no se borra una categoría con cursos y sigue ahí', async () => {
    const id = (await run(GUARDAR, { n: 'zz e2e Con cursos', p: 1 }, admin.token)).data?.guardar_categoria as { id: number };
    sql(`insert into escuela.cursos (slug, instructor_id, titulo, categoria_id) values ('zz-e2e-curso', '${admin.id}', 'Curso de prueba e2e', ${id.id})`);
    const body = await run(BORRAR, { id: id.id }, admin.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La categoría tiene cursos asignados.', extensions: { codigo: 'CATEGORIA_EN_USO' } });
    expect(await list()).toHaveLength(1);
    sql(`delete from escuela.cursos where slug = 'zz-e2e-curso'`);
    expect((await run(BORRAR, { id: id.id }, admin.token)).data).toEqual({ borrar_categoria: { ok: true } });
  });

  it('valida nombre (2 a 60), letra o número y posición (1 a 1000), todos los errores juntos', async () => {
    const check = async (variables: Record<string, unknown>) => (await run(GUARDAR, variables, admin.token)).errors?.[0].extensions;
    expect(await check({ n: 'a', p: 1 })).toEqual({
      codigo: 'VALIDACION_FALLIDA',
      detalles: [{ campo: 'nombre', regla: 'longitud_minima', mensaje: 'Debe tener al menos 2 caracteres.' }],
    });
    expect((await check({ n: 'x'.repeat(61), p: 1 }))?.detalles).toEqual([{ campo: 'nombre', regla: 'longitud_maxima', mensaje: 'Debe tener como máximo 60 caracteres.' }]);
    expect((await check({ n: '!!!', p: 1 }))?.detalles).toEqual([{ campo: 'nombre', regla: 'formato_invalido', mensaje: 'Debe incluir al menos una letra o un número.' }]);
    expect((await check({ n: '   ', p: 1 }))?.detalles).toEqual([{ campo: 'nombre', regla: 'longitud_minima', mensaje: 'Debe tener al menos 2 caracteres.' }]);
    expect((await check({ n: 'ab\u0007cd', p: 1 }))?.detalles).toEqual([{ campo: 'nombre', regla: 'formato_invalido', mensaje: 'No puede tener caracteres de control.' }]);
    const several = await check({ id: 0, n: 'a', p: 1001 });
    expect(several?.detalles?.map((d) => `${d.campo}:${d.mensaje}`).sort()).toEqual(
      ['id:Debe ser al menos 1.', 'nombre:Debe tener al menos 2 caracteres.', 'posicion:Debe ser como máximo 1000.'].sort(),
    );
    expect((await check({ n: 'zz e2e ok', p: 0 }))?.detalles).toEqual([{ campo: 'posicion', regla: 'min', mensaje: 'Debe ser al menos 1.' }]);
    expect((await check({ id: 32001, n: 'zz e2e ok', p: 1 }))?.detalles).toEqual([{ campo: 'id', regla: 'max', mensaje: 'Debe ser como máximo 32000.' }]);
    expect(code(await run(BORRAR, { id: 0 }, admin.token))).toBe('VALIDACION_FALLIDA');
    expect(sql(`select count(*) from escuela.categorias where ${CATEGORY_SLUGS}`)).toBe('0');
  });

  it('un campo extra o un tipo equivocado da 400 SOLICITUD_INVALIDA (lo rechaza el esquema de GraphQL)', async () => {
    const extra = await gql('mutation { guardar_categoria(nombre: "zz e2e extra", posicion: 1, slug: "otro") { id } }', {}, admin.token).expect(400);
    expect(extra.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    const wrongType = await gql('mutation { guardar_categoria(nombre: "zz e2e tipo", posicion: "uno") { id } }', {}, admin.token).expect(400);
    expect(wrongType.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(sql(`select count(*) from escuela.categorias where ${CATEGORY_SLUGS}`)).toBe('0');
  });
});

describe('scripts/create-admin.sh', () => {
  const script = (correo: string) => {
    try {
      const out = execFileSync('bash', ['api/scripts/create-admin.sh', correo], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, out };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { status: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };

  it('un correo inexistente sale con código distinto de 0 y no inserta nada', () => {
    const rows = sql('select count(*) from escuela.roles_usuario');
    const r = script('nadie_zz_e2e@example.com');
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('No existe un usuario verificado');
    expect(sql('select count(*) from escuela.roles_usuario')).toBe(rows);
  });

  it('un correo sin forma de correo sale con 2 y una cuenta sin verificar con 1', async () => {
    expect(script('no-es-correo').status).toBe(2);
    const person = await createUser(false);
    const id = sql(`select id from auth.users where email = '${person.correo}'`, 'postgres');
    userIds.push(id);
    expect(script(person.correo).status).toBe(1);
    expect(rolesInDb(id)).toBe('');
  });

  it('da el rol administrador a una cuenta verificada, es idempotente y no imprime secretos', async () => {
    const account = await newAccount();
    for (let i = 0; i < 2; i++) {
      const r = script(account.person.correo.toUpperCase());
      expect(r.status).toBe(0);
      expect(r.out).toContain(`Rol administrador asignado a ${account.person.correo}`);
      expect(r.out).not.toMatch(/eyJ|password|contrasena/i);
    }
    expect(rolesInDb(account.id)).toBe('administrador');
    expect(await run(MIS_ROLES, {}, account.token)).toMatchObject({ data: { mis_roles: { roles: ['administrador'] } } });
  });
});
