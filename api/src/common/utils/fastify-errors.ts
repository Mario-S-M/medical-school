import { HttpException } from '@nestjs/common';
import { ApiException, uniformError } from './api-exception';

interface FastifyError extends Error {
  code?: string;
  statusCode?: number;
}

// Errores de lectura del cuerpo que Fastify lanza antes de llegar al código de la API (tipo, tamaño, JSON roto).
// Devuelve `null` si el error es de otra clase. Lo usan el filtro de excepciones y el formateador de GraphQL.
export function translateFastifyError(error: unknown): ApiException | null {
  // El adaptador de Nest envuelve los errores 4xx de Fastify en un HttpException y deja el original en `cause`.
  const e = (error instanceof HttpException && error.cause ? error.cause : error) as FastifyError;
  const fastifyCode = typeof e?.code === 'string' ? e.code : '';
  if (fastifyCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return uniformError(415, 'TIPO_CONTENIDO_NO_SOPORTADO');
  if (fastifyCode === 'FST_ERR_CTP_BODY_TOO_LARGE') return uniformError(413, 'CUERPO_DEMASIADO_GRANDE');
  if (fastifyCode.startsWith('FST_ERR_CTP_') || (e instanceof SyntaxError && e.statusCode === 400)) {
    return uniformError(400, 'JSON_INVALIDO');
  }
  return null;
}
