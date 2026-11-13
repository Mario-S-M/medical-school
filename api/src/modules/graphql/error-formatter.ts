import { Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ExecutionResult, GraphQLError } from 'graphql';
import { ErrorDetail, ApiException, uniformError } from '../../common/utils/api-exception';
import { translateFastifyError } from '../../common/utils/fastify-errors';

interface MercuriusError extends Error {
  code?: string;
  statusCode?: number;
  errors?: Error[];
}
interface GraphqlErrorLike {
  message: string;
  locations?: unknown;
  path?: unknown;
  extensions?: { codigo?: unknown; detalles?: unknown };
  originalError?: MercuriusError;
}

const logger = new Logger('GraphQL');
const thrown = new WeakSet<object>(); // errores de ejecución ya relanzados como excepción uniforme
const SUGGESTION = /\s*Did you mean[^?]*\?/g; // "Did you mean ..." de graphql-js: no se filtran nombres del esquema
const PERSISTED_QUERY_CODES = ['MER_ERR_GQL_PERSISTED_QUERY_NOT_FOUND', 'MER_ERR_GQL_PERSISTED_QUERY_NOT_SUPPORTED', 'MER_ERR_GQL_PERSISTED_QUERY_MISMATCH'];

// Errores que se producen antes de ejecutar (cuerpo, límites, lista blanca, sintaxis, validación): formato uniforme.
function classifyRequestFailure(error: MercuriusError, production: boolean): ApiException {
  if (error instanceof ApiException) return error;
  const fromFastify = translateFastifyError(error);
  if (fromFastify) return fromFastify;
  if (error.code && PERSISTED_QUERY_CODES.includes(error.code)) return uniformError(400, 'CONSULTA_NO_PERMITIDA');
  if (Array.isArray(error.errors)) {
    if (error.errors.some((e) => /introspection has been disabled/i.test(e.message))) return uniformError(400, 'CONSULTA_NO_PERMITIDA');
    // En producción solo se dice que la consulta no es válida; en desarrollo se añade qué falló, sin sugerencias.
    const detalles: ErrorDetail[] | undefined = production
      ? undefined
      : error.errors.slice(0, 10).map((e) => ({ campo: 'consulta', regla: 'graphql', mensaje: e.message.replace(SUGGESTION, '') }));
    return new ApiException(400, 'SOLICITUD_INVALIDA', undefined, detalles);
  }
  // Un GraphQLError suelto antes de ejecutar (variable obligatoria ausente o `operationName` desconocido en una consulta
  // persistida) es un error del cliente: nunca un 500 ni una traza en el registro.
  if (error.name === 'GraphQLError') {
    const detalles: ErrorDetail[] | undefined = production ? undefined : [{ campo: 'consulta', regla: 'graphql', mensaje: error.message.replace(SUGGESTION, '') }];
    return new ApiException(400, 'SOLICITUD_INVALIDA', undefined, detalles);
  }
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) return uniformError(error.statusCode, 'SOLICITUD_INVALIDA');
  logger.error(error.stack ?? error.message);
  return uniformError(500, 'ERROR_INTERNO');
}

type Result = { statusCode: number; response: ExecutionResult };

// `errorFormatter` de Mercurius. Dos casos:
//  - la petición falló antes de ejecutarse (no hay `data`): `400/405/413/415/429 { error: {codigo, mensaje, detalles?}, errors: [...] }`.
//    `errors` repite el error en forma GraphQL (`extensions.codigo`) para que el cliente (urql) lo lea sin tratarlo como fallo de red.
//  - falló un campo (hay `data`, normalmente `null`): `200 { data, errors: [{ message, path, extensions: { codigo } }] }`.
//    Todo error sin código propio (p. ej. una excepción de un resolutor) sale como ERROR_INTERNO sin detalles.
export function createErrorFormatter(production: boolean) {
  return (execution: { data?: unknown; errors?: readonly GraphQLError[] }, context: { reply?: FastifyReply }): Result => {
    const errors = (execution.errors ?? []) as unknown as GraphqlErrorLike[];
    if (!('data' in execution)) {
      const first = errors[0];
      const origin = (first?.originalError ?? first ?? new Error('sin error')) as MercuriusError;
      const api = classifyRequestFailure(origin, production);
      // Mercurius solo conserva `data` y `errors` del formateador cuando el fallo ocurre al ejecutar (variables ausentes,
      // operationName desconocido). Se lanza una vez la excepción uniforme para que su manejador de errores la responda entera.
      if (origin === first && origin.name === 'GraphQLError' && !(origin instanceof ApiException) && !thrown.has(origin)) {
        thrown.add(origin);
        throw api;
      }
      for (const [name, value] of Object.entries(api.headers)) context.reply?.header(name, value);
      const body = { ...api.body(), errors: [{ message: api.apiMessage, extensions: { codigo: api.code } }] };
      return { statusCode: api.getStatus(), response: body as unknown as ExecutionResult };
    }
    const output = errors.map((e) => {
      const code = typeof e.extensions?.codigo === 'string' ? e.extensions.codigo : null;
      if (code) {
        const detalles = Array.isArray(e.extensions?.detalles) ? e.extensions.detalles : undefined; // VALIDACION_FALLIDA
        return { message: e.message, locations: e.locations, path: e.path, extensions: { codigo: code, ...(detalles ? { detalles } : {}) } };
      }
      logger.error(e.originalError?.stack ?? e.message);
      return { message: uniformError(500, 'ERROR_INTERNO').apiMessage, locations: e.locations, path: e.path, extensions: { codigo: 'ERROR_INTERNO' } };
    });
    return { statusCode: 200, response: { data: (execution.data ?? null) as null, errors: output } as unknown as ExecutionResult };
  };
}
