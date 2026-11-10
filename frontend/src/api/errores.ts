import { MENSAJES_ESCUELA } from './mensajes_escuela';
import type { DetalleError } from './tipos';

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public detalles: DetalleError[] = [],
    public reintentarEn?: number,
  ) {
    super(mensaje);
  }
}

const MENSAJES: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  CODIGO_INVALIDO: 'El código no es válido o venció.',
  CUENTA_BLOQUEADA: 'Demasiados intentos fallidos. Espera para volver a intentar.',
  CODIGO_BLOQUEADO: 'Demasiados códigos erróneos. Espera para volver a intentar.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera para volver a intentar.',
  VALIDACION_FALLIDA: 'Revisa los datos del formulario.',
  CONTRASENA_INSEGURA: 'La contraseña no cumple los requisitos.',
  ...MENSAJES_ESCUELA,
};

export const MENSAJE_GENERICO = 'Algo salió mal. Inténtalo de nuevo.';

export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return MENSAJES[error.codigo] ?? MENSAJE_GENERICO;
  return MENSAJE_GENERICO;
}

export function detallesDeCampo(error: unknown, campo: string): string[] {
  if (!(error instanceof ErrorApi)) return [];
  return error.detalles.filter((d) => d.campo === campo).map((d) => d.mensaje);
}
