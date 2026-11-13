import type { ThrottlerStorage } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { ApiException } from '../../common/utils/api-exception';
import { clientIp } from '../../common/utils/client-ip';
import { classifyRequest, Manifest } from './persisted-queries';

export const GRAPHQL_PATH = '/api/graphql';
const IS_JSON = /^application\/json\s*(;.*)?$/i;

export interface ProtectionOptions {
  production: boolean;
  limitStorage: ThrottlerStorage;
  manifest: Manifest;
  limit: number;
  windowMs: number;
}

// Hook `preValidation` de las rutas de Mercurius: corre antes de leer la consulta, así que cada petición se cuenta, se
// comprueba el método y el tipo de contenido y se resuelve el hash persistido. Lo que lance sale por el formateador de
// errores de GraphQL con el formato uniforme.
export function createProtections(options: ProtectionOptions) {
  return async function protect(request: FastifyRequest): Promise<void> {
    // 1. Límite general de la IP (120 por minuto), contado una vez por petición HTTP.
    const logger = await options.limitStorage.increment(
      `graphql-${clientIp(request)}`,
      options.windowMs,
      options.limit,
      options.windowMs,
      'graphql',
    );
    if (logger.isBlocked) {
      const segundos = Math.max(1, logger.timeToBlockExpire || logger.timeToExpire);
      throw new ApiException(429, 'DEMASIADAS_SOLICITUDES', undefined, undefined, segundos, { 'Retry-After': String(segundos) });
    }

    // 2. Solo POST (Mercurius también registra GET y QUERY; aquí se cierran).
    if (request.method !== 'POST') {
      throw new ApiException(405, 'METODO_NO_PERMITIDO', undefined, undefined, undefined, { Allow: 'POST' });
    }

    // 3. Solo application/json.
    if (!IS_JSON.test(request.headers['content-type'] ?? '')) throw new ApiException(415, 'TIPO_CONTENIDO_NO_SOPORTADO');

    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ApiException(400, 'SOLICITUD_INVALIDA');
    const data = body as Record<string, unknown>;

    // 4. Consultas persistidas: en producción solo hashes del manifiesto; en desarrollo también texto completo. Todas las
    //    formas con hash se reducen a la nativa de Mercurius `{ query: <hash>, persisted: true }`.
    const parsed = classifyRequest(data);
    if (parsed.kind === 'full') {
      if (options.production) throw new ApiException(400, 'CONSULTA_NO_PERMITIDA');
      return;
    }
    if (parsed.hash === null || options.manifest[parsed.hash] === undefined) throw new ApiException(400, 'CONSULTA_NO_PERMITIDA');
    request.body = { query: parsed.hash, persisted: true, variables: data.variables, operationName: data.operationName };
  };
}
