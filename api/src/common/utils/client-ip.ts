import type { FastifyRequest } from 'fastify';

// Fastify ya resuelve `req.ip` con `trustProxy`: solo lee `X-Forwarded-For` si el pariente directo es de confianza.
export function clientIp(request: Pick<FastifyRequest, 'ip'>): string {
  return request.ip.replace(/^::ffff:/, '');
}
