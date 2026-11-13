import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import request from 'supertest';

// Ayudas de los e2e que corren contra el stack real (contenedor `api`, Supabase Auth y la base `plataforma`).
// La base no se publica en el host: se consulta con `docker compose exec db psql` (como superusuario `supabase_admin`).
// No imprimen ni exigen ningún secreto.

export const URL_API = process.env.URL_API ?? 'http://127.0.0.1:3000';
export const REPO_ROOT = resolve(__dirname, '../../..');
export const VALID_PASSWORD = 'Zorro#Azul-2026x';
const EMAIL_PREFIX = 'prueba_e2e_';

// Ejecuta SQL en la base indicada y devuelve la salida (filas separadas por salto de línea, columnas por `|`).
export function sql(consulta: string, base: 'plataforma' | 'postgres' = 'plataforma'): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'supabase_admin', '-d', base, '-tAq', '-v', 'ON_ERROR_STOP=1'], {
    cwd: REPO_ROOT,
    input: consulta,
    encoding: 'utf8',
  }).trim();
}

const SAFE = /^[a-z0-9_.@-]+$/;
function safe(value: string): string {
  if (!SAFE.test(value)) throw new Error(`Valor no permitido en SQL: ${value}`);
  return value;
}

let emailCounter = 0;
export const newEmail = (): string => `${EMAIL_PREFIX}${process.pid}_${Date.now()}_${emailCounter++}@example.com`;

// Cada prueba usa su propia IP del rango de evaluación (198.18.0.0/15), así los bloqueos y el límite no chocan.
let ipCounter = Math.floor(Math.random() * 60_000);
export function newIp(): string {
  ipCounter = (ipCounter + 1) % 65_000;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

// Confirma el correo sin pasar por el flujo de verificación (que llega en el paso 4).
export function confirmEmail(correo: string): void {
  const n = sql(`update auth.users set email_confirmed_at = now() where email = '${safe(correo)}' returning 1`, 'postgres');
  if (n !== '1') throw new Error('No se encontró el usuario a confirmar');
}

export function countAttempts(correo: string): number {
  return Number(sql(`select count(*) from autenticacion.intentos_inicio_sesion where correo = '${safe(correo)}'`));
}

// Envejece los intentos de un correo para probar la ventana de 15 min y la limpieza de 24 h.
export function ageAttempts(correo: string, interval: string): void {
  if (!/^\d+ (minutes|hours)$/.test(interval)) throw new Error('Intervalo no permitido');
  sql(`update autenticacion.intentos_inicio_sesion set creado_en = creado_en - interval '${interval}' where correo = '${safe(correo)}'`);
}

export function insertOldAttempt(correo: string, ip: string, interval: string): void {
  sql(`insert into autenticacion.intentos_inicio_sesion (correo, ip, exitoso, creado_en) values ('${safe(correo)}', '${safe(ip)}', false, now() - interval '${interval}')`);
}

export function countAttemptsByIp(ip: string): number {
  return Number(sql(`select count(*) from autenticacion.intentos_inicio_sesion where ip = '${safe(ip)}'::inet`));
}

// Borra los usuarios de prueba (y sus sesiones, en cascada) y los intentos que dejaron.
export function cleanup(): void {
  sql(`delete from auth.users where email like '${EMAIL_PREFIX}%@example.com'`, 'postgres');
  sql(`delete from autenticacion.intentos_inicio_sesion where correo like '${EMAIL_PREFIX}%' or ip <<= '198.18.0.0/15'::inet`);
  sql(`delete from autenticacion.eventos_codigo where correo like '${EMAIL_PREFIX}%' or ip <<= '198.18.0.0/15'::inet`);
}

// --- Eventos de código (límites de la SPEC 05) ---

export type Purpose = 'verificacion' | 'recuperacion';
export type EventType = 'solicitud' | 'error';

export function countEvents(correo: string, proposito?: Purpose, tipo?: EventType): number {
  const filtros = [`correo = '${safe(correo)}'`];
  if (proposito) filtros.push(`proposito = '${proposito}'`);
  if (tipo) filtros.push(`tipo = '${tipo}'`);
  return Number(sql(`select count(*) from autenticacion.eventos_codigo where ${filtros.join(' and ')}`));
}

export function countEventsByIp(ip: string): number {
  return Number(sql(`select count(*) from autenticacion.eventos_codigo where ip = '${safe(ip)}'::inet`));
}

// Inserta `cantidad` eventos con la antigüedad dada (para probar la ventana deslizante y la limpieza de 1 día).
export function insertEvents(count: number, correo: string, ip: string, proposito: Purpose, tipo: EventType, interval: string): void {
  if (!/^\d+ (minutes|hours|days)$/.test(interval)) throw new Error('Intervalo no permitido');
  sql(
    `insert into autenticacion.eventos_codigo (proposito, tipo, correo, ip, creado_en)
     select '${proposito}', '${tipo}', '${safe(correo)}', '${safe(ip)}'::inet, now() - interval '${interval}' from generate_series(1, ${Number(count)})`,
  );
}

// Atrasa el envío del último código (Supabase Auth solo reenvía 1 vez por minuto y caduca a los 15 minutos).
export function delaySend(correo: string, column: 'confirmation_sent_at' | 'recovery_sent_at', interval: string): void {
  if (!/^\d+ minutes$/.test(interval)) throw new Error('Intervalo no permitido');
  const n = sql(`update auth.users set ${column} = now() - interval '${interval}' where email = '${safe(correo)}' returning 1`, 'postgres');
  if (n !== '1') throw new Error('No se encontró el usuario');
}

export function isEmailConfirmed(correo: string): boolean {
  return sql(`select email_confirmed_at is not null from auth.users where email = '${safe(correo)}'`, 'postgres') === 't';
}

// --- Mailpit (API en 127.0.0.1:8025) ---

export const URL_MAILPIT = process.env.URL_MAILPIT ?? 'http://127.0.0.1:8025';

interface MailpitMessage {
  ID: string;
  Subject: string;
}

async function searchEmails(correo: string): Promise<MailpitMessage[]> {
  const r = await fetch(`${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${safe(correo)}`)}`);
  return ((await r.json()) as { messages: MailpitMessage[] }).messages;
}

export async function countEmails(correo: string): Promise<number> {
  return (await searchEmails(correo)).length;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera a que haya más de `previos` correos para el destinatario y devuelve asunto y texto del más reciente.
export async function waitForNewEmail(correo: string, previous: number, ms = 15_000): Promise<{ subject: string; text: string; html: string; from: string }> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const messages = await searchEmails(correo);
    if (messages.length > previous) {
      const detail = (await (await fetch(`${URL_MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as {
        Subject: string;
        Text: string;
        HTML: string;
        From: { Name: string; Address: string };
      };
      return { subject: detail.Subject, text: detail.Text, html: detail.HTML, from: `${detail.From.Name} <${detail.From.Address}>` };
    }
    await pause(200);
  }
  throw new Error('No llegó el correo esperado a Mailpit');
}

// Código de 6 dígitos del correo nuevo que llegue después de `previos`.
export async function waitForCode(correo: string, previous: number): Promise<string> {
  const { text } = await waitForNewEmail(correo, previous);
  const codigo = text.match(/\b(\d{6})\b/)?.[1];
  if (!codigo) throw new Error('El correo no trae un código de 6 dígitos');
  return codigo;
}

// Comprueba que NO llega ningún correo nuevo en `ms`.
export async function assertNoNewEmail(correo: string, previous: number, ms = 2500): Promise<void> {
  await pause(ms);
  if ((await countEmails(correo)) !== previous) throw new Error('Llegó un correo que no debía llegar');
}

export async function deleteTestEmails(): Promise<void> {
  await fetch(`${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL_PREFIX}`)}`, { method: 'DELETE' });
}


export const http = () => request(URL_API);

export interface Person {
  correo: string;
  contrasena: string;
  ip: string;
}

// Crea un usuario por la API. Con `verificado` confirma el correo por SQL.
export async function createUser(verificado: boolean, contrasena = VALID_PASSWORD): Promise<Person> {
  const person = { correo: newEmail(), contrasena, ip: newIp() };
  await http()
    .post('/api/v1/usuarios')
    .set('X-Forwarded-For', person.ip)
    .send({ correo: person.correo, nombre: 'Prueba e2e', contrasena })
    .expect(201);
  if (verificado) confirmEmail(person.correo);
  return person;
}

export function signIn(person: Pick<Person, 'correo' | 'ip'>, contrasena: string) {
  return http().post('/api/v1/sesiones').set('X-Forwarded-For', person.ip).send({ correo: person.correo, contrasena });
}

// Valor de `token_renovacion` en el Set-Cookie de una respuesta (o `undefined`).
export function cookieValue(headers: Record<string, unknown>): string | undefined {
  const list = ([] as string[]).concat((headers['set-cookie'] as string[] | string | undefined) ?? []);
  const line = list.find((c) => c.startsWith('token_renovacion='));
  return line?.split(';')[0].slice('token_renovacion='.length);
}
