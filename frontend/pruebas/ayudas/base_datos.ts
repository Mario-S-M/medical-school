import { execFileSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(process.cwd(), '..');

function sql(base: string, consulta: string) {
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', base, '-c', consulta], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
}

export const limpiarLimites = () =>
  sql('n8n', 'truncate autenticacion.eventos_codigo, autenticacion.intentos_inicio_sesion');

// Quita de la escuela lo que dejaron las cuentas de prueba (roles, cursos, categorías E2E) antes de borrarlas.
export function limpiarEscuelaE2E() {
  const ids = execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-tA', '-c',
    "select string_agg(quote_literal(id::text), ',') from auth.users where email like 'e2e-%@ejemplo.test'"], { cwd: RAIZ }).toString().trim();
  const propios = ids ? `usuario_id::text in (${ids})` : 'false';
  const duenos = ids ? `instructor_id::text in (${ids})` : 'false';
  sql('n8n', `delete from escuela.cursos where ${duenos}; delete from escuela.roles_usuario where ${propios}; delete from escuela.perfiles_instructor where ${propios}; delete from escuela.categorias where nombre like 'E2E %'`);
}

export const borrarUsuariosE2E = () =>
  sql('postgres', "delete from auth.users where email like 'e2e-%@ejemplo.test' or email like 'manual-%@ejemplo.test'");

// Supabase Auth limita a 1 correo por minuto por usuario: se retrocede el último envío.
export function retrasarEnvio(correo: string) {
  if (!/^[a-z0-9.@_-]+$/.test(correo)) throw new Error('Correo de prueba no válido');
  sql('postgres', `update auth.users set confirmation_sent_at = now() - interval '2 minutes', recovery_sent_at = now() - interval '2 minutes' where email = '${correo}'`);
}
