import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createUser, newIp, Person, signIn, sql } from './real-env';

// Ayudas comunes de los e2e de la escuela (SPEC 10): peticiones GraphQL a la app en proceso y cuentas de prueba reales.

export interface GqlBody {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions: { codigo: string; detalles?: { campo: string; regla: string; mensaje: string }[] } }[];
}

export function gql(app: NestFastifyApplication, query: string, variables: Record<string, unknown> = {}, token?: string) {
  const r = request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', newIp());
  if (token) r.set('Authorization', `Bearer ${token}`);
  return r.send({ query, variables });
}

export async function run(app: NestFastifyApplication, query: string, variables: Record<string, unknown>, token?: string): Promise<GqlBody> {
  return (await gql(app, query, variables, token).expect(200)).body as GqlBody;
}

export const code = (body: GqlBody): string | undefined => body.errors?.[0]?.extensions.codigo;

export interface Account {
  person: Person;
  token: string;
  id: string;
}

// Crea un usuario verificado, inicia sesión por la API real y apunta su id para limpiarlo después.
export async function newAccount(userIds: string[]): Promise<Account> {
  const person = await createUser(true);
  const token = (await signIn(person, person.contrasena).expect(200)).body.token_acceso as string;
  const id = (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
  userIds.push(id);
  return { person, token, id };
}

export function giveRole(id: string, role: 'instructor' | 'administrador'): void {
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${id}', '${role}') on conflict do nothing`);
  if (role === 'instructor') {
    sql(`insert into escuela.perfiles_instructor (usuario_id, nombre_publico) values ('${id}', 'Instructor e2e') on conflict do nothing`);
  }
}

// Equipo de apoyo como lo deja aceptar una invitación: fila del equipo y rol `equipo_apoyo`.
export function addToTeam(instructorId: string, memberId: string): void {
  sql(`insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('${instructorId}', '${memberId}') on conflict do nothing`);
  sql(`insert into escuela.roles_usuario (usuario_id, rol) values ('${memberId}', 'equipo_apoyo') on conflict do nothing`);
}

export function removeAccountResidue(userIds: string[]): void {
  for (const id of userIds) {
    sql(`delete from escuela.cursos where instructor_id = '${id}'`); // cae el temario y los videos
    sql(`delete from escuela.equipos_apoyo where instructor_id = '${id}' or miembro_id = '${id}'`);
    sql(`delete from escuela.roles_usuario where usuario_id = '${id}'`);
    sql(`delete from escuela.perfiles_instructor where usuario_id = '${id}'`);
  }
}

export const courseCount = (): number => Number(sql('select count(*) from escuela.cursos'));
export const setStatus = (courseId: number, status: 'borrador' | 'en_revision' | 'publicado'): void =>
  void sql(`update escuela.cursos set estado = '${status}' where id = ${courseId}`);
