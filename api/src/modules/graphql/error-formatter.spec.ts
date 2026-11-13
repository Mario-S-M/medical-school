import { GraphQLError } from 'graphql';
import { createErrorFormatter } from './error-formatter';

const reply = { header: jest.fn() } as never;

describe('createErrorFormatter: errores del cliente antes de ejecutar', () => {
  it.each([true, false])('un GraphQLError suelto (variable ausente, operationName desconocido) es 400 SOLICITUD_INVALIDA (producción=%s)', (production) => {
    const format = createErrorFormatter(production);
    for (const message of ['Variable "$activo" of required type "Boolean!" was not provided.', 'Unknown operation named "yo".']) {
      const error = new GraphQLError(message);
      let thrown: unknown;
      try {
        format({ errors: [error] }, { reply });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toMatchObject({ code: 'SOLICITUD_INVALIDA' }); // se lanza la excepción uniforme para que Mercurius la responda entera
      const result = format({ errors: [new GraphQLError(message, { originalError: thrown as Error })] }, { reply });
      expect(result.statusCode).toBe(400);
      expect(result.response).toMatchObject({ error: { codigo: 'SOLICITUD_INVALIDA' } });
      if (production) expect(JSON.stringify(result.response)).not.toMatch(/activo|Unknown operation/);
    }
  });

  it('un error cualquiera sin datos sigue siendo 500 ERROR_INTERNO', () => {
    const result = createErrorFormatter(true)({ errors: [new Error('falló') as never] }, { reply });
    expect(result.statusCode).toBe(500);
  });
});
