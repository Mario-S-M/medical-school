import { ApiError } from './api-error';
import { SCHOOL_ERROR_MESSAGES } from './school-error-messages';

const MESSAGES: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  CODIGO_INVALIDO: 'El código no es válido o venció.',
  CUENTA_BLOQUEADA: 'Demasiados intentos fallidos. Espera para volver a intentar.',
  CODIGO_BLOQUEADO: 'Demasiados códigos erróneos. Espera para volver a intentar.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera para volver a intentar.',
  VALIDACION_FALLIDA: 'Revisa los datos del formulario.',
  DEMASIADAS_SOLICITUDES: 'Demasiadas solicitudes. Espera para volver a intentar.',
  SOLICITUD_INVALIDA: 'No pudimos procesar la solicitud. Inténtalo de nuevo.',
  CONSULTA_NO_PERMITIDA: 'No pudimos procesar la solicitud. Inténtalo de nuevo.',
  CONSULTA_DEMASIADO_COMPLEJA: 'No pudimos procesar la solicitud. Inténtalo de nuevo.',
  CONTRASENA_INSEGURA: 'La contraseña no cumple los requisitos.',
  ...SCHOOL_ERROR_MESSAGES,
};

export const GENERIC_MESSAGE = 'Algo salió mal. Inténtalo de nuevo.';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? GENERIC_MESSAGE;
  return GENERIC_MESSAGE;
}

export function fieldDetails(error: unknown, field: string): string[] {
  if (!(error instanceof ApiError)) return [];
  return error.details.filter((d) => d.campo === field).map((d) => d.mensaje);
}
