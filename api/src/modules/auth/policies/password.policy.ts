import { ErrorDetail } from '../../../common/utils/api-exception';

export const NOT_COMMON_MESSAGE = 'Es una contraseña demasiado común.';

const detail = (regla: string, mensaje: string): ErrorDetail => ({ campo: 'contrasena', regla, mensaje });

// Reglas locales de la política (SPEC 04). Devuelve todas las que fallan, en el mismo orden que el workflow.
// `email` ya viene normalizado (recortado y en minúsculas).
export function evaluatePasswordPolicy(password: string, email: string): ErrorDetail[] {
  const failures: ErrorDetail[] = [];
  if ([...password].length < 12) failures.push(detail('minimo_12_caracteres', 'Debe tener al menos 12 caracteres.'));
  if (Buffer.byteLength(password, 'utf8') > 72) failures.push(detail('maximo_72_bytes', 'No puede superar 72 bytes en UTF-8.'));
  if (!/\p{Lu}/u.test(password)) failures.push(detail('requiere_mayuscula', 'Debe incluir al menos una mayúscula.'));
  if (!/\p{Ll}/u.test(password)) failures.push(detail('requiere_minuscula', 'Debe incluir al menos una minúscula.'));
  if (!/\p{N}/u.test(password)) failures.push(detail('requiere_numero', 'Debe incluir al menos un número.'));
  if (!/[^\p{L}\p{N}\s]/u.test(password)) failures.push(detail('requiere_simbolo', 'Debe incluir al menos un símbolo.'));
  if (password !== password.trim()) failures.push(detail('sin_espacios_extremos', 'No puede empezar ni terminar con espacios.'));
  const lower = password.toLowerCase();
  const localPart = email.split('@')[0];
  if (lower.includes(email) || (localPart.length >= 4 && lower.includes(localPart))) {
    failures.push(detail('no_contiene_correo', 'No puede contener tu correo ni su parte local.'));
  }
  return failures;
}

// Valores que se buscan en `autenticacion.contrasenas_comunes`: la contraseña en minúsculas y, si termina en
// dígitos o símbolos, también sin ese final (así `Password123!` cae por `password`).
export function commonCandidates(password: string): string[] {
  const lower = password.toLowerCase();
  const candidates = [lower];
  const withoutSuffix = lower.replace(/[\d\W_]+$/u, '');
  if (withoutSuffix && withoutSuffix !== lower) candidates.push(withoutSuffix);
  return candidates;
}

export function notCommonDetail(): ErrorDetail {
  return detail('no_es_comun', NOT_COMMON_MESSAGE);
}
