import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { deleteByPrefix } from './storage';

const ROOT = path.resolve(process.cwd(), '..');

function sql(base: string, consulta: string) {
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', base, '-c', consulta], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

export const clearLimits = () =>
  sql('plataforma', 'truncate autenticacion.eventos_codigo, autenticacion.intentos_inicio_sesion');

const SCHOOL = 'plataforma';

// Quita de la escuela (plataforma.escuela) lo que dejaron las cuentas de prueba: cursos, equipos, invitaciones, roles,
// perfiles y categorías E2E, y sus archivos de Storage. No toca los datos reales.
export async function cleanSchoolE2E() {
  const ids = consulta('postgres', "select string_agg(quote_literal(id::text), ',') from auth.users where email like 'e2e-%@ejemplo.test'");
  const propios = ids ? `usuario_id::text in (${ids})` : 'false';
  const duenos = ids ? `instructor_id::text in (${ids})` : 'false';
  const equipos = ids ? `instructor_id::text in (${ids}) or miembro_id::text in (${ids})` : 'false';
  const cursos = consulta(SCHOOL, `select id from escuela.cursos where ${duenos} or slug like 'e2e-%'`).split('\n').filter(Boolean);
  const prefijos = cursos.map((id) => `cursos/${id}`);
  await deleteByPrefix('portadas', prefijos);
  await deleteByPrefix('videos', prefijos);
  sql(SCHOOL, `delete from escuela.cursos where ${duenos} or slug like 'e2e-%'; delete from escuela.equipos_apoyo where ${equipos}; delete from escuela.invitaciones_equipo where ${equipos}; delete from escuela.roles_usuario where ${propios}; delete from escuela.perfiles_instructor where ${propios}; delete from escuela.categorias where nombre like 'E2E %'`);
}

export const deleteUsersE2E = () =>
  sql('postgres', "delete from auth.users where email like 'e2e-%@ejemplo.test' or email like 'manual-%@ejemplo.test'");

// Supabase Auth limita a 1 correo por minuto por usuario: se retrocede el último envío.
export function delaySending(correo: string) {
  if (!/^[a-z0-9.@_-]+$/.test(correo)) throw new Error('Correo de prueba no válido');
  sql('postgres', `update auth.users set confirmation_sent_at = now() - interval '2 minutes', recovery_sent_at = now() - interval '2 minutes' where email = '${correo}'`);
}

const consulta = (base: string, sentencia: string) =>
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', base, '-tA', '-c', sentencia], { cwd: ROOT }).toString().trim();

// Da un rol de la escuela a una cuenta de prueba (equivale a lo que hace un administrador desde /admin/roles).
export function grantRole(correo: string, rol: 'instructor' | 'administrador' | 'equipo_apoyo') {
  if (!/^[a-z0-9.@_-]+$/.test(correo)) throw new Error('Correo de prueba no válido');
  const id = consulta('postgres', `select id from auth.users where email = '${correo}'`);
  sql(SCHOOL, `insert into escuela.roles_usuario (usuario_id, rol) values ('${id}', '${rol}') on conflict do nothing`);
  if (rol === 'instructor') sql(SCHOOL, `insert into escuela.perfiles_instructor (usuario_id, nombre_publico) values ('${id}', 'Prueba E2E') on conflict do nothing`);
}

export const createCategoryE2E = (nombre: string) =>
  sql(SCHOOL, `insert into escuela.categorias (nombre, slug, posicion) values ('${nombre}', lower(replace('${nombre}', ' ', '-')), 990) on conflict do nothing`);

export const setCourseStateE2E = (titulo: string, estado: string) =>
  sql(SCHOOL, `update escuela.cursos set estado = '${estado}' where titulo = '${titulo}'`);

// Equivale a subir una portada (la subida real llega en el paso de portadas): deja una ruta en el curso.
export const setCourseCoverE2E = (titulo: string) =>
  sql(SCHOOL, `update escuela.cursos set portada_ruta = 'cursos/e2e/portada.png' where titulo = '${titulo}'`);

// Curso ya publicado (con una sección y una clase muestra) para probar el catálogo sin pasar por la revisión.
export function createPublishedCourseE2E(titulo: string, slug: string, nivel = 'basico', minutos = 0) {
  sql(SCHOOL, `with c as (insert into escuela.cursos (slug, instructor_id, titulo, subtitulo, descripcion, nivel, categoria_id, estado, publicado_en)
    values ('${slug}', gen_random_uuid(), '${titulo}', 'Subtítulo de ${titulo}', 'Descripción', '${nivel}',
    (select id from escuela.categorias where nombre = 'E2E Ciencias'), 'publicado', now() - interval '${minutos} minutes') on conflict (slug) do nothing returning id),
    s as (insert into escuela.secciones (curso_id, titulo, posicion) select id, 'Sección uno', 1 from c returning id)
    insert into escuela.clases (seccion_id, titulo, es_muestra, duracion_estimada_minutos, posicion) select id, 'Clase de muestra', true, 5, 1 from s`);
}

// Deja un video listo y vigente en cada clase del curso (para los flujos que solo necesitan que las clases tengan video).
export const setVideoReadyE2E = (titulo: string) =>
  sql(SCHOOL, `insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base, listo_en)
    select k.id, 'listo', true, 'a.mp4', 'video/mp4', 10, 60, 'x', now() from escuela.clases k join escuela.secciones s on s.id = k.seccion_id
    join escuela.cursos c on c.id = s.curso_id where c.titulo = '${titulo}'`);
