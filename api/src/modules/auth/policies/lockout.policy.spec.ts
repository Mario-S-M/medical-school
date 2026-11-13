import { LoginAttemptCounts, evaluateLockout } from './lockout.policy';

const counts = (c: Partial<LoginAttemptCounts> = {}): LoginAttemptCounts => ({
  emailFailures: 0,
  emailRetryAfter: 60,
  ipFailures: 0,
  ipRetryAfter: 90,
  ...c,
});

describe('evaluarBloqueos', () => {
  it('sin fallos no bloquea', () => expect(evaluateLockout(counts())).toEqual({ blocked: false }));
  it('4 fallos del correo aún no bloquean', () => expect(evaluateLockout(counts({ emailFailures: 4 }))).toEqual({ blocked: false }));
  it('5 fallos del correo bloquean la cuenta', () => {
    expect(evaluateLockout(counts({ emailFailures: 5, emailRetryAfter: 123 }))).toEqual({
      blocked: true,
      code: 'CUENTA_BLOQUEADA',
      message: 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.',
      seconds: 123,
    });
  });
  it('más de 5 fallos también bloquean', () => {
    expect(evaluateLockout(counts({ emailFailures: 9 }))).toMatchObject({ blocked: true, code: 'CUENTA_BLOQUEADA' });
  });
  it('19 fallos de la IP no bloquean', () => expect(evaluateLockout(counts({ ipFailures: 19 }))).toEqual({ blocked: false }));
  it('20 fallos de la IP bloquean con DEMASIADOS_INTENTOS', () => {
    expect(evaluateLockout(counts({ ipFailures: 20, ipRetryAfter: 45 }))).toEqual({
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      message: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.',
      seconds: 45,
    });
  });
  it('si se cumplen ambas, gana el bloqueo de la cuenta y su tiempo', () => {
    expect(evaluateLockout(counts({ emailFailures: 5, emailRetryAfter: 10, ipFailures: 30, ipRetryAfter: 500 }))).toMatchObject({
      code: 'CUENTA_BLOQUEADA',
      seconds: 10,
    });
  });
});
