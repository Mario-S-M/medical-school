import { ErrorDetail } from '../../../common/utils/api-exception';
import { EmailDto } from '../dto/email.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';

// Validación estricta de los cuerpos de la SPEC 04 y 05. Funciones puras (no decoradores) para mantener estables los
// mensajes y el orden de `detalles` que consume el front: campos de más, ausentes o de otro tipo y, después, el resto de reglas.
// Devuelven los datos ya normalizados con nombres en inglés; los campos del cuerpo (contrato) siguen en español.

const EMAIL_FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// eslint-disable-next-line no-control-regex -- justamente se buscan caracteres de control
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
const CODE_FORMAT = /^[0-9]{6}$/;

export const INVALID_REQUEST_MESSAGE = 'La solicitud no es válida.';

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; details: ErrorDetail[] };

type Body = Record<string, unknown>;

const isObject = (body: unknown): body is Body => typeof body === 'object' && body !== null && !Array.isArray(body);

const notAnObject = (): ErrorDetail[] => [{ campo: 'cuerpo', regla: 'debe_ser_objeto', mensaje: 'El cuerpo debe ser un objeto JSON.' }];

// Campos de más, ausentes o que no son texto (en ese orden).
function checkFields(body: Body, expected: string[]): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  for (const key of Object.keys(body)) {
    if (!expected.includes(key)) details.push({ campo: key.slice(0, 40), regla: 'campo_no_permitido', mensaje: 'Este campo no está permitido.' });
  }
  for (const field of expected) {
    if (!(field in body)) details.push({ campo: field, regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' });
    else if (typeof body[field] !== 'string') details.push({ campo: field, regla: 'debe_ser_texto', mensaje: 'Debe ser un texto.' });
  }
  return details;
}

// Correo recortado y en minúsculas, o el detalle de error.
function checkEmail(raw: string): { email: string; detail?: ErrorDetail } {
  const email = raw.trim().toLowerCase();
  const local = email.split('@')[0] || '';
  if (email.length === 0 || email.length > 254 || local.length > 64 || !EMAIL_FORMAT.test(email)) {
    return { email, detail: { campo: 'correo', regla: 'formato_invalido', mensaje: 'Debe ser un correo válido de hasta 254 caracteres.' } };
  }
  return { email };
}

// Correo del cuerpo (si es texto): lo normaliza y añade su error de formato.
function readEmail(body: Body, details: ErrorDetail[]): string {
  if (typeof body.correo !== 'string') return '';
  const result = checkEmail(body.correo);
  if (result.detail) details.push(result.detail);
  return result.email;
}

const codeDetail = (): ErrorDetail => ({ campo: 'codigo', regla: 'formato_invalido', mensaje: 'Debe ser un código de exactamente 6 dígitos.' });

export function validateRegister(body: unknown): ValidationResult<RegisterDto> {
  if (!isObject(body)) return { ok: false, details: notAnObject() };
  const details = checkFields(body, ['correo', 'nombre', 'contrasena']);
  const name = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const password = typeof body.contrasena === 'string' ? body.contrasena : '';
  const email = readEmail(body, details);
  if (typeof body.nombre === 'string') {
    const length = [...name].length;
    if (length < 1 || length > 80) {
      details.push({ campo: 'nombre', regla: 'largo_invalido', mensaje: 'Debe tener entre 1 y 80 caracteres.' });
    } else if (CONTROL_CHARS.test(name)) {
      details.push({ campo: 'nombre', regla: 'caracteres_de_control', mensaje: 'No puede tener caracteres de control.' });
    }
  }
  return details.length > 0 ? { ok: false, details } : { ok: true, data: { email, name, password } };
}

export function validateLogin(body: unknown): ValidationResult<LoginDto> {
  if (!isObject(body)) return { ok: false, details: notAnObject() };
  const details = checkFields(body, ['correo', 'contrasena']);
  const password = typeof body.contrasena === 'string' ? body.contrasena : '';
  const email = readEmail(body, details);
  if (typeof body.contrasena === 'string' && (password.length === 0 || Buffer.byteLength(password, 'utf8') > 1024)) {
    details.push({ campo: 'contrasena', regla: 'largo_invalido', mensaje: 'No puede estar vacía ni superar 1024 bytes.' });
  }
  return details.length > 0 ? { ok: false, details } : { ok: true, data: { email, password } };
}

// `reenvio` y `recuperaciones`: solo el correo.
export function validateEmailOnly(body: unknown): ValidationResult<EmailDto> {
  if (!isObject(body)) return { ok: false, details: notAnObject() };
  const details = checkFields(body, ['correo']);
  const email = readEmail(body, details);
  return details.length > 0 ? { ok: false, details } : { ok: true, data: { email } };
}

export function validateVerifyEmail(body: unknown): ValidationResult<VerifyEmailDto> {
  if (!isObject(body)) return { ok: false, details: notAnObject() };
  const details = checkFields(body, ['correo', 'codigo']);
  const email = readEmail(body, details);
  if (typeof body.codigo === 'string' && !CODE_FORMAT.test(body.codigo)) details.push(codeDetail());
  return details.length > 0 ? { ok: false, details } : { ok: true, data: { email, code: body.codigo as string } };
}

// La política de la contraseña nueva se evalúa después (en el servicio), una vez comprobados los límites.
export function validateResetPassword(body: unknown): ValidationResult<ResetPasswordDto> {
  if (!isObject(body)) return { ok: false, details: notAnObject() };
  const details = checkFields(body, ['correo', 'codigo', 'contrasena_nueva']);
  const email = readEmail(body, details);
  if (typeof body.codigo === 'string' && !CODE_FORMAT.test(body.codigo)) details.push(codeDetail());
  if (details.length > 0) return { ok: false, details };
  return { ok: true, data: { email, code: body.codigo as string, newPassword: body.contrasena_nueva as string } };
}
