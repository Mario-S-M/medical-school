import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommonModule } from '../src/common/common.module';
import { configureApp, createAdapter } from '../src/common/utils/app-setup';
import { MailTemplatesModule } from '../src/modules/mail-templates/mail-templates.module';
import { OPTIONS } from './helpers/start-app';
import { assertNoNewEmail, cleanup, countEmails, deleteTestEmails, newIp, sql, waitForNewEmail } from './helpers/real-env';
import { Account, code, courseCount, giveRole, newAccount, removeAccountResidue, run } from './helpers/school-gql';
import { startSchool } from './helpers/start-school';

// SPEC 10, paso 7: equipo de apoyo e invitaciones (`mi_equipo`, `mis_invitaciones`, `invitar_equipo`, `responder_invitacion`,
// `cancelar_invitacion`, `quitar_miembro`) y correo por SMTP real hacia Mailpit. La app corre EN PROCESO (modo desarrollo)
// contra el stack real, con login real. Cada prueba limpia su residuo (cursos `zz-e2e-*`, filas del equipo, cuentas, correos de
// Mailpit); los datos copiados de la escuela no se tocan.

let app: NestFastifyApplication;
const userIds: string[] = [];
const TAG = `${process.pid}`;

const MI_EQUIPO = '{ mi_equipo { miembros { miembro_id desde correo } invitaciones { id correo expira_en } } }';
const MIS_INVITACIONES = '{ mis_invitaciones { id instructor creado_en expira_en } }';
const INVITAR = 'mutation($c: String!) { invitar_equipo(correo: $c) { id expira_en correo_enviado } }';
const RESPONDER = 'mutation($i: EnteroGrande!, $a: Boolean!) { responder_invitacion(invitacion_id: $i, aceptar: $a) { aceptada } }';
const CANCELAR = 'mutation($i: EnteroGrande!) { cancelar_invitacion(invitacion_id: $i) { ok } }';
const QUITAR = 'mutation($m: ID!) { quitar_miembro(miembro_id: $m) { ok } }';
const MIS_ROLES = '{ mis_roles { roles equipos { instructor_id } } }';
const SECCION = 'mutation($c: EnteroGrande!, $t: String!) { guardar_seccion(curso_id: $c, titulo: $t) { id } }';
const EDITAR = 'mutation($c: EnteroGrande!, $n: String) { editar_curso(curso_id: $c, nivel: $n) { id } }';
const ENVIAR = 'mutation($c: EnteroGrande!) { enviar_revision(curso_id: $c) { estado } }';

let instructor: Account;
let other: Account;
let plain: Account;
let before = 0;
let courseId = 0;

const newUser = (): Promise<Account> => newAccount(userIds);
const emailOf = (account: Account): string => account.person.correo;
const dbState = (id: number): string => sql(`select estado from escuela.invitaciones_equipo where id = ${id}`);
const rolesOf = async (account: Account): Promise<string[]> => ((await run(app, MIS_ROLES, {}, account.token)).data as { mis_roles: { roles: string[] } }).mis_roles.roles;

// Invita y devuelve el id de la invitación.
async function invite(from: Account, to: Account): Promise<number> {
  const body = await run(app, INVITAR, { c: emailOf(to) }, from.token);
  expect(body.errors).toBeUndefined();
  return Number((body.data as { invitar_equipo: { id: number } }).invitar_equipo.id);
}
// El invitado acepta: ya está en el equipo de `from` y tiene el rol.
async function join(from: Account, to: Account): Promise<void> {
  const id = await invite(from, to);
  expect((await run(app, RESPONDER, { i: id, a: true }, to.token)).errors).toBeUndefined();
}
const teamOf = async (account: Account) => (await run(app, MI_EQUIPO, {}, account.token)).data as { mi_equipo: { miembros: { miembro_id: string; correo: string | null }[]; invitaciones: { id: number; correo: string }[] } };

beforeAll(async () => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  before = courseCount();
  app = await startSchool();
  instructor = await newUser();
  giveRole(instructor.id, 'instructor');
  other = await newUser();
  giveRole(other.id, 'instructor');
  plain = await newUser();
  courseId = Number(sql(`insert into escuela.cursos (slug, instructor_id, titulo) values ('zz-e2e-team-${TAG}', '${instructor.id}', 'ZZ Equipo ${TAG}') returning id`));
});
afterAll(async () => {
  await app.close();
  sql(`delete from escuela.invitaciones_equipo where instructor_id::text in (${userIds.map((i) => `'${i}'`).join(',')}) or miembro_id::text in (${userIds.map((i) => `'${i}'`).join(',')})`);
  sql(`delete from escuela.cursos where slug like 'zz-e2e-%'`);
  removeAccountResidue(userIds);
  cleanup();
  await deleteTestEmails();
  expect(courseCount()).toBe(before); // no queda ningún curso de prueba y los datos copiados siguen intactos
});

describe('sin token y permisos', () => {
  it('todas las operaciones dan TOKEN_INVALIDO', async () => {
    const calls: [string, Record<string, unknown>][] = [
      [MI_EQUIPO, {}],
      [MIS_INVITACIONES, {}],
      [INVITAR, { c: 'a@b.co' }],
      [RESPONDER, { i: 1, a: true }],
      [CANCELAR, { i: 1 }],
      [QUITAR, { m: '00000000-0000-4000-8000-000000000000' }],
    ];
    for (const [query, variables] of calls) expect(code(await run(app, query, variables))).toBe('TOKEN_INVALIDO');
  });

  it('mi_equipo, invitar_equipo, cancelar_invitacion y quitar_miembro exigen ser instructor (SIN_PERMISO) antes de validar', async () => {
    const member = await newUser();
    await join(instructor, member);
    for (const account of [plain, member]) {
      for (const [query, variables] of [
        [MI_EQUIPO, {}],
        [INVITAR, { c: emailOf(other) }],
        [INVITAR, { c: 'no-es-correo' }],
        [CANCELAR, { i: 0 }],
        [QUITAR, { m: 'no-es-uuid' }],
      ] as [string, Record<string, unknown>][]) {
        const body = await run(app, query, variables, account.token);
        expect(body.errors?.[0]).toMatchObject({ message: 'No tienes permiso para hacer esto.', extensions: { codigo: 'SIN_PERMISO' } });
      }
    }
    expect((await teamOf(instructor)).mi_equipo.invitaciones).toEqual([]); // el miembro no pudo invitar a nadie
  });

  it('mis_invitaciones y responder_invitacion las puede usar cualquier persona con sesión', async () => {
    expect(await run(app, MIS_INVITACIONES, {}, plain.token)).toEqual({ data: { mis_invitaciones: [] } });
    expect(code(await run(app, RESPONDER, { i: 1, a: true }, plain.token))).toBe('NO_ENCONTRADO');
  });
});

describe('invitar_equipo', () => {
  it('un correo mal formado da VALIDACION_FALLIDA con formato_correo', async () => {
    const body = await run(app, INVITAR, { c: 'sin-arroba' }, instructor.token);
    expect(body.errors?.[0].extensions.codigo).toBe('VALIDACION_FALLIDA');
    expect(body.errors?.[0].extensions.detalles).toEqual([{ campo: 'correo', regla: 'formato_correo', mensaje: 'Debe ser un correo válido.' }]);
  });

  it('un correo sin cuenta da USUARIO_NO_REGISTRADO y no manda correo', async () => {
    const missing = `prueba_e2e_sincuenta_${TAG}@example.com`;
    const body = await run(app, INVITAR, { c: missing }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'Ese correo no tiene una cuenta registrada.', extensions: { codigo: 'USUARIO_NO_REGISTRADO' } });
    await assertNoNewEmail(missing, 0, 500);
  });

  it('una cuenta sin verificar el correo también da USUARIO_NO_REGISTRADO', async () => {
    const { createUser } = await import('./helpers/real-env');
    const unverified = await createUser(false);
    const body = await run(app, INVITAR, { c: unverified.correo.toUpperCase() }, instructor.token); // el correo se pasa a minúsculas
    expect(body.errors?.[0]).toMatchObject({ message: 'Esa cuenta todavía no verificó su correo.', extensions: { codigo: 'USUARIO_NO_REGISTRADO' } });
  });

  it('invitarse a uno mismo da ESTADO_INVALIDO', async () => {
    const body = await run(app, INVITAR, { c: emailOf(instructor) }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'No puedes invitarte a ti mismo.', extensions: { codigo: 'ESTADO_INVALIDO' } });
  });

  it('a una cuenta registrada: crea la invitación (7 días) y manda a Mailpit un correo en español sin enlaces', async () => {
    const guest = await newUser();
    const previous = await countEmails(emailOf(guest));
    const body = await run(app, INVITAR, { c: emailOf(guest) }, instructor.token);
    expect(body.errors).toBeUndefined();
    const created = (body.data as { invitar_equipo: { id: number; expira_en: string; correo_enviado: boolean } }).invitar_equipo;
    expect(Object.keys(created).sort()).toEqual(['correo_enviado', 'expira_en', 'id']);
    expect(created.correo_enviado).toBe(true);
    const days = (new Date(created.expira_en).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(dbState(Number(created.id))).toBe('pendiente');

    const mail = await waitForNewEmail(emailOf(guest), previous);
    expect(mail.subject).toBe('Instructor e2e te invitó a su equipo de apoyo');
    expect(mail.from).toBe('Medical School <no-responder@escuela.local>');
    expect(mail.html).toContain('Te invitaron al equipo de apoyo');
    expect(mail.html).toContain('<strong>Instructor e2e</strong> te invitó a formar parte de su equipo de apoyo en Medical School.');
    const deadline = new Date(created.expira_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
    expect(mail.html).toContain(`La invitación vence el <strong>${deadline}</strong>.`);
    expect(mail.html).not.toContain('{{');
    expect(mail.html).not.toMatch(/https?:|<a[\s>]|href=/i); // sin enlaces ni atribución
  });

  it('repetirla da INVITACION_DUPLICADA y no manda otro correo', async () => {
    const guest = await newUser();
    await invite(instructor, guest);
    const sent = await countEmails(emailOf(guest));
    const body = await run(app, INVITAR, { c: emailOf(guest) }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'Ya hay una invitación pendiente para esa persona.', extensions: { codigo: 'INVITACION_DUPLICADA' } });
    await assertNoNewEmail(emailOf(guest), sent, 800);
  });

  it('invitar a quien ya está en el equipo da YA_ES_MIEMBRO', async () => {
    const member = await newUser();
    await join(instructor, member);
    const body = await run(app, INVITAR, { c: emailOf(member) }, instructor.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'Esa persona ya está en tu equipo.', extensions: { codigo: 'YA_ES_MIEMBRO' } });
  });
});

describe('mi_equipo y mis_invitaciones', () => {
  it('muestran la invitación a ambos lados y no se filtran a otras cuentas', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    const sent = (await teamOf(instructor)).mi_equipo.invitaciones.find((i) => Number(i.id) === id);
    expect(sent).toMatchObject({ correo: emailOf(guest) });
    const received = (await run(app, MIS_INVITACIONES, {}, guest.token)).data as { mis_invitaciones: Record<string, unknown>[] };
    expect(received.mis_invitaciones).toHaveLength(1);
    expect(received.mis_invitaciones[0]).toMatchObject({ id, instructor: 'Instructor e2e' });
    expect(Object.keys(received.mis_invitaciones[0]).sort()).toEqual(['creado_en', 'expira_en', 'id', 'instructor']);
    expect(await run(app, MIS_INVITACIONES, {}, plain.token)).toEqual({ data: { mis_invitaciones: [] } });
    expect((await teamOf(other)).mi_equipo.invitaciones.some((i) => Number(i.id) === id)).toBe(false);
  });

  it('mi_equipo trae a los miembros con el correo con que aceptaron', async () => {
    const member = await newUser();
    await join(instructor, member);
    const found = (await teamOf(instructor)).mi_equipo.miembros.find((m) => m.miembro_id === member.id);
    expect(found).toMatchObject({ correo: emailOf(member) });
    expect(Object.keys((await run(app, MI_EQUIPO, {}, instructor.token)).data?.mi_equipo as object).sort()).toEqual(['invitaciones', 'miembros']);
  });
});

describe('responder_invitacion', () => {
  it('aceptar da el rol equipo_apoyo: edita el temario pero no editar_curso, enviar_revision, portada ni invitar_equipo', async () => {
    const member = await newUser();
    expect(code(await run(app, SECCION, { c: courseId, t: 'Antes de aceptar' }, member.token))).toBe('SIN_PERMISO');
    const id = await invite(instructor, member);
    expect(await run(app, RESPONDER, { i: id, a: true }, member.token)).toEqual({ data: { responder_invitacion: { aceptada: true } } });
    expect(dbState(id)).toBe('aceptada');
    expect(await rolesOf(member)).toEqual(['equipo_apoyo']);
    expect((await run(app, MIS_ROLES, {}, member.token)).data).toEqual({ mis_roles: { roles: ['equipo_apoyo'], equipos: [{ instructor_id: instructor.id }] } });
    expect(await run(app, MIS_INVITACIONES, {}, member.token)).toEqual({ data: { mis_invitaciones: [] } });

    expect((await run(app, SECCION, { c: courseId, t: 'Sección del equipo' }, member.token)).errors).toBeUndefined();
    expect(code(await run(app, EDITAR, { c: courseId, n: 'basico' }, member.token))).toBe('SIN_PERMISO');
    expect(code(await run(app, ENVIAR, { c: courseId }, member.token))).toBe('SIN_PERMISO');
    expect(code(await run(app, INVITAR, { c: emailOf(other) }, member.token))).toBe('SIN_PERMISO');
    const cover = await request(app.getHttpServer())
      .post('/api/v1/portadas/firmas')
      .set('X-Forwarded-For', newIp())
      .set('Authorization', `Bearer ${member.token}`)
      .send({ curso_id: courseId, tipo_contenido: 'image/png', tamano_bytes: 10 });
    expect(cover.status).toBe(403);
    expect(cover.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('responder dos veces la misma invitación da NO_ENCONTRADO', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    await run(app, RESPONDER, { i: id, a: true }, guest.token);
    const body = await run(app, RESPONDER, { i: id, a: true }, guest.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La invitación no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('rechazar no da rol ni entra al equipo, y se puede volver a invitar', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    expect(await run(app, RESPONDER, { i: id, a: false }, guest.token)).toEqual({ data: { responder_invitacion: { aceptada: false } } });
    expect(dbState(id)).toBe('rechazada');
    expect(await rolesOf(guest)).toEqual([]);
    expect(code(await run(app, SECCION, { c: courseId, t: 'x' }, guest.token))).toBe('SIN_PERMISO');
    expect(await invite(instructor, guest)).not.toBe(id);
  });

  it('la invitación de otra persona da NO_ENCONTRADO y no cambia nada', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    expect(code(await run(app, RESPONDER, { i: id, a: true }, plain.token))).toBe('NO_ENCONTRADO');
    expect(dbState(id)).toBe('pendiente');
    expect(await rolesOf(plain)).toEqual([]);
  });

  it('datos mal formados dan VALIDACION_FALLIDA', async () => {
    const body = await run(app, RESPONDER, { i: 0, a: true }, plain.token);
    expect(body.errors?.[0].extensions.detalles).toEqual([expect.objectContaining({ campo: 'invitacion_id', regla: 'valor_minimo' })]);
  });
});

describe('invitaciones vencidas', () => {
  it('no aparecen, no se pueden responder y se puede reinvitar (la vencida queda cancelada)', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    sql(`update escuela.invitaciones_equipo set expira_en = now() - interval '1 minute' where id = ${id}`);
    expect(await run(app, MIS_INVITACIONES, {}, guest.token)).toEqual({ data: { mis_invitaciones: [] } });
    expect((await teamOf(instructor)).mi_equipo.invitaciones.some((i) => Number(i.id) === id)).toBe(false);
    const body = await run(app, RESPONDER, { i: id, a: true }, guest.token);
    expect(body.errors?.[0]).toMatchObject({ message: 'La invitación no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(await rolesOf(guest)).toEqual([]);

    const again = await invite(instructor, guest);
    expect(again).not.toBe(id);
    expect(dbState(id)).toBe('cancelada');
    expect(dbState(again)).toBe('pendiente');
    const received = (await run(app, MIS_INVITACIONES, {}, guest.token)).data as { mis_invitaciones: { id: number }[] };
    expect(received.mis_invitaciones.map((i) => Number(i.id))).toEqual([again]);
  });
});

describe('cancelar_invitacion', () => {
  it('cancela, la persona ya no puede responder y se puede reinvitar', async () => {
    const guest = await newUser();
    const id = await invite(instructor, guest);
    const foreign = await run(app, CANCELAR, { i: id }, other.token); // otro instructor
    expect(code(foreign)).toBe('NO_ENCONTRADO');
    expect(dbState(id)).toBe('pendiente');
    expect(await run(app, CANCELAR, { i: id }, instructor.token)).toEqual({ data: { cancelar_invitacion: { ok: true } } });
    expect(dbState(id)).toBe('cancelada');
    expect(code(await run(app, RESPONDER, { i: id, a: true }, guest.token))).toBe('NO_ENCONTRADO');
    const again = await run(app, CANCELAR, { i: id }, instructor.token);
    expect(again.errors?.[0]).toMatchObject({ message: 'La invitación pendiente no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
    expect(await invite(instructor, guest)).not.toBe(id);
  });
});

describe('quitar_miembro', () => {
  it('retira el acceso y el rol equipo_apoyo', async () => {
    const member = await newUser();
    await join(instructor, member);
    expect((await run(app, SECCION, { c: courseId, t: 'Del equipo' }, member.token)).errors).toBeUndefined();
    expect(await run(app, QUITAR, { m: member.id }, instructor.token)).toEqual({ data: { quitar_miembro: { ok: true } } });
    expect(code(await run(app, SECCION, { c: courseId, t: 'Después de salir' }, member.token))).toBe('SIN_PERMISO');
    expect(await rolesOf(member)).toEqual([]);
    expect((await teamOf(instructor)).mi_equipo.miembros.some((m) => m.miembro_id === member.id)).toBe(false);
    const again = await run(app, QUITAR, { m: member.id }, instructor.token);
    expect(again.errors?.[0]).toMatchObject({ message: 'El miembro no existe en este curso.', extensions: { codigo: 'NO_ENCONTRADO' } });
  });

  it('quien sigue en el equipo de otro instructor conserva el rol; al salir del último lo pierde', async () => {
    const member = await newUser();
    await join(instructor, member);
    await join(other, member);
    expect((await run(app, QUITAR, { m: member.id }, instructor.token)).errors).toBeUndefined();
    expect(await rolesOf(member)).toEqual(['equipo_apoyo']);
    expect((await run(app, QUITAR, { m: member.id }, other.token)).errors).toBeUndefined();
    expect(await rolesOf(member)).toEqual([]);
  });

  it('quitar a alguien que no es de tu equipo da NO_ENCONTRADO y no toca su rol', async () => {
    const member = await newUser();
    await join(other, member);
    expect(code(await run(app, QUITAR, { m: member.id }, instructor.token))).toBe('NO_ENCONTRADO');
    expect(await rolesOf(member)).toEqual(['equipo_apoyo']);
  });

  it('un miembro_id que no es uuid da VALIDACION_FALLIDA', async () => {
    const body = await run(app, QUITAR, { m: 'abc' }, instructor.token);
    expect(body.errors?.[0].extensions.detalles).toEqual([{ campo: 'miembro_id', regla: 'formato_uuid', mensaje: 'Debe ser un identificador válido.' }]);
  });
});

describe('plantilla del correo', () => {
  it('team-invitation.html es interna: no se sirve por HTTP, mientras las de Supabase Auth sí', async () => {
    const module = await Test.createTestingModule({ imports: [CommonModule, MailTemplatesModule] }).compile();
    const http = module.createNestApplication<NestFastifyApplication>(createAdapter(OPTIONS), { logger: false });
    configureApp(http, OPTIONS);
    await http.init();
    await http.getHttpAdapter().getInstance().ready();
    try {
      const get = (path: string) => request(http.getHttpServer()).get(path).set('X-Forwarded-For', newIp());
      expect((await get('/plantillas-correo/verificacion.html')).status).toBe(200);
      for (const path of ['team-invitation.html', 'team_invitation.html', 'invitacion_equipo.html', '..%2Ftemplates%2Fteam-invitation.html']) {
        const response = await get(`/plantillas-correo/${path}`);
        expect(response.status).toBe(404);
        expect(response.body.error.codigo).toBe('NO_ENCONTRADO');
      }
    } finally {
      await http.close();
    }
  });
});
