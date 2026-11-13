import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { uniformError } from './api-exception';
import { translateFastifyError } from './fastify-errors';
import { trackRoutes } from './route-registry';

export interface AppSetupOptions {
  frontOrigin: string;
  trustedProxies: string[];
}

export const MAX_BODY_SIZE = 10 * 1024; // 10 KB, como el `request_body` de Caddy
const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH', 'DELETE'];
const IS_JSON = /^application\/json\s*(;.*)?$/i;

// `trustProxy` acotado: Fastify solo lee `X-Forwarded-For` si el pariente directo está en esta lista.
export function createAdapter(options: Pick<AppSetupOptions, 'trustedProxies'>): FastifyAdapter {
  return new FastifyAdapter({ bodyLimit: MAX_BODY_SIZE, trustProxy: options.trustedProxies });
}

function replyWithError(reply: FastifyReply, status: number, code: string): FastifyReply {
  return reply
    .status(status)
    .header('Content-Type', 'application/json; charset=utf-8')
    .send(uniformError(status, code).body());
}

// Cabeceras de seguridad, CORS, 415 y preflight. Equivale a lo que hacía el Caddyfile (SPEC 04).
// Debe llamarse antes de `app.init()` o `app.listen()`.
export function configureApp(app: NestFastifyApplication, options: AppSetupOptions): void {
  const fastify = app.getHttpAdapter().getInstance();
  trackRoutes(fastify);

  // Con GraphQL en la app, Fastify contesta con su propio JSON los errores de lectura del cuerpo (JSON roto, 413) de las
  // rutas REST sin pasar por el filtro de Nest. Aquí se reescriben al formato uniforme.
  fastify.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (reply.statusCode < 400 || typeof payload !== 'string' || !payload.includes('"FST_ERR_')) return payload;
    try {
      const fastifyError = JSON.parse(payload) as { code?: string; statusCode?: number };
      const api = translateFastifyError(fastifyError) ?? uniformError(fastifyError.statusCode ?? 400, 'SOLICITUD_INVALIDA');
      reply.status(api.getStatus()).header('Content-Type', 'application/json; charset=utf-8').removeHeader('Content-Length');
      return JSON.stringify(api.body());
    } catch {
      return payload;
    }
  });

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    reply.removeHeader('Server');
    reply.removeHeader('X-Powered-By');

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (origin !== options.frontOrigin) return replyWithError(reply, 403, 'ORIGEN_NO_PERMITIDO');
      reply.header('Access-Control-Allow-Origin', options.frontOrigin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Expose-Headers', 'Retry-After');
      reply.header('Vary', 'Origin');
      if (request.method === 'OPTIONS') {
        reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Solicitado-Con');
        reply.header('Access-Control-Max-Age', '600');
        return reply.status(204).send();
      }
    }

    // Un cuerpo que no sea JSON se rechaza antes de leerlo (también en DELETE, que Fastify no revisa).
    const length = Number(request.headers['content-length'] ?? 0);
    const hasBody = length > 0 || request.headers['transfer-encoding'] !== undefined;
    if (METHODS_WITH_BODY.includes(request.method) && hasBody && !IS_JSON.test(request.headers['content-type'] ?? '')) {
      return replyWithError(reply, 415, 'TIPO_CONTENIDO_NO_SOPORTADO');
    }
  });
}
