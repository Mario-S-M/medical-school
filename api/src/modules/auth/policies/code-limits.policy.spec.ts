import { ErrorCounts, RequestCounts, evaluateErrors, evaluateRequests } from './code-limits.policy';

const requests = (c: Partial<RequestCounts> = {}): RequestCounts => ({
  emailRequests: 0,
  emailRetryAfter: 600,
  ipRequests: 0,
  ipRetryAfter: 900,
  ...c,
});
const errors = (c: Partial<ErrorCounts> = {}): ErrorCounts => ({
  emailErrors: 0,
  emailRetryAfter: 60,
  ipErrors: 0,
  ipRetryAfter: 90,
  ...c,
});

describe('evaluarSolicitudes (3 por correo y propósito y 10 por IP, cada hora)', () => {
  it('sin solicitudes no bloquea', () => expect(evaluateRequests(requests())).toEqual({ blocked: false }));
  it('2 del correo aún no bloquean', () => expect(evaluateRequests(requests({ emailRequests: 2 }))).toEqual({ blocked: false }));
  it('la cuarta solicitud del correo (3 previas) bloquea con el tiempo del evento más viejo', () => {
    expect(evaluateRequests(requests({ emailRequests: 3, emailRetryAfter: 321 }))).toEqual({
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      message: 'Demasiadas solicitudes de código. Inténtalo de nuevo más tarde.',
      seconds: 321,
    });
  });
  it('9 de la IP no bloquean y la undécima (10 previas) sí, con el tiempo de la IP', () => {
    expect(evaluateRequests(requests({ ipRequests: 9 }))).toEqual({ blocked: false });
    expect(evaluateRequests(requests({ ipRequests: 10, ipRetryAfter: 77 }))).toMatchObject({
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      seconds: 77,
    });
  });
  it('si fallan ambos gana el del correo', () => {
    expect(evaluateRequests(requests({ emailRequests: 3, ipRequests: 10, emailRetryAfter: 5, ipRetryAfter: 6 }))).toMatchObject({ seconds: 5 });
  });
});

describe('evaluarErrores (5 por correo y propósito y 20 por IP, cada 15 min)', () => {
  it('sin errores no bloquea', () => expect(evaluateErrors(errors())).toEqual({ blocked: false }));
  it('4 errores del correo aún no bloquean', () => expect(evaluateErrors(errors({ emailErrors: 4 }))).toEqual({ blocked: false }));
  it('5 errores del correo bloquean con CODIGO_BLOQUEADO', () => {
    expect(evaluateErrors(errors({ emailErrors: 5, emailRetryAfter: 123 }))).toEqual({
      blocked: true,
      code: 'CODIGO_BLOQUEADO',
      message: 'Demasiados códigos erróneos. Inténtalo de nuevo más tarde.',
      seconds: 123,
    });
  });
  it('19 errores de la IP no bloquean y 20 bloquean con DEMASIADOS_INTENTOS', () => {
    expect(evaluateErrors(errors({ ipErrors: 19 }))).toEqual({ blocked: false });
    expect(evaluateErrors(errors({ ipErrors: 20, ipRetryAfter: 45 }))).toEqual({
      blocked: true,
      code: 'DEMASIADOS_INTENTOS',
      message: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.',
      seconds: 45,
    });
  });
  it('si fallan ambos gana el del correo', () => {
    expect(evaluateErrors(errors({ emailErrors: 5, ipErrors: 20 }))).toMatchObject({ code: 'CODIGO_BLOQUEADO', seconds: 60 });
  });
});
