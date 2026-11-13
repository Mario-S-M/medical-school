import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { clientIp } from '../utils/client-ip';

// Uso: `register(@ClientIp() ip: string)`. Para bloqueos por IP (SPEC 04 y 05).
export const ClientIp = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  clientIp(context.switchToHttp().getRequest<FastifyRequest>()),
);
