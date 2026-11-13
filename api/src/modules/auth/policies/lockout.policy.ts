export const MAX_EMAIL_FAILURES = 5;
export const MAX_IP_FAILURES = 20;
export const LOCKOUT_WINDOW_SECONDS = 15 * 60;

export interface LoginAttemptCounts {
  emailFailures: number;
  emailRetryAfter: number; // segundos hasta que el fallo más viejo salga de la ventana
  ipFailures: number;
  ipRetryAfter: number;
}

export type LockoutDecision =
  | { blocked: false }
  | { blocked: true; code: 'CUENTA_BLOQUEADA' | 'DEMASIADOS_INTENTOS'; message: string; seconds: number };

// Regla de las SPEC 04: la cuenta (por correo, exista o no) se bloquea con 5 fallos; la IP, con 20. Gana la cuenta.
export function evaluateLockout(c: LoginAttemptCounts): LockoutDecision {
  if (c.emailFailures >= MAX_EMAIL_FAILURES) {
    return {
      blocked: true,
      code: 'CUENTA_BLOQUEADA',
      message: 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.',
      seconds: c.emailRetryAfter,
    };
  }
  if (c.ipFailures >= MAX_IP_FAILURES) {
    return {
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      message: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.',
      seconds: c.ipRetryAfter,
    };
  }
  return { blocked: false };
}
