// Límites de los códigos por correo (SPEC 05). Ventanas deslizantes que cuenta la base sobre
// `autenticacion.eventos_codigo`; aquí solo se decide con los conteos ya hechos.

export const MAX_REQUESTS_PER_EMAIL = 3; // por correo y propósito
export const MAX_REQUESTS_PER_IP = 10; // ambos propósitos
export const REQUESTS_WINDOW_SECONDS = 60 * 60;
export const MAX_ERRORS_PER_EMAIL = 5; // por correo y propósito
export const MAX_ERRORS_PER_IP = 20; // ambos propósitos
export const ERRORS_WINDOW_SECONDS = 15 * 60;

export type CodePurpose = 'verificacion' | 'recuperacion';

export interface RequestCounts {
  emailRequests: number;
  emailRetryAfter: number; // segundos hasta que el evento más viejo de la ventana salga de ella
  ipRequests: number;
  ipRetryAfter: number;
}

export interface ErrorCounts {
  emailErrors: number;
  emailRetryAfter: number;
  ipErrors: number;
  ipRetryAfter: number;
}

export type CodeDecision =
  | { blocked: false }
  | { blocked: true; code: 'DEMASIADOS_INTENTOS' | 'CODIGO_BLOQUEADO'; message: string; seconds: number };

// Gana el límite por correo (se evalúa primero); un rechazo no se registra como evento.
export function evaluateRequests(c: RequestCounts): CodeDecision {
  const message = 'Demasiadas solicitudes de código. Inténtalo de nuevo más tarde.';
  if (c.emailRequests >= MAX_REQUESTS_PER_EMAIL) {
    return { blocked: true, code: 'DEMASIADOS_INTENTOS', message, seconds: c.emailRetryAfter };
  }
  if (c.ipRequests >= MAX_REQUESTS_PER_IP) {
    return { blocked: true, code: 'DEMASIADOS_INTENTOS', message, seconds: c.ipRetryAfter };
  }
  return { blocked: false };
}

// Con 5 errores del correo se rechaza incluso el código correcto.
export function evaluateErrors(c: ErrorCounts): CodeDecision {
  if (c.emailErrors >= MAX_ERRORS_PER_EMAIL) {
    return {
      blocked: true,
      code: 'CODIGO_BLOQUEADO',
      message: 'Demasiados códigos erróneos. Inténtalo de nuevo más tarde.',
      seconds: c.emailRetryAfter,
    };
  }
  if (c.ipErrors >= MAX_ERRORS_PER_IP) {
    return {
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      message: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.',
      seconds: c.ipRetryAfter,
    };
  }
  return { blocked: false };
}
