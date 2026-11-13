import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { FastifyRequest } from 'fastify';

// La petición Fastify de cualquier contexto: REST (`switchToHttp`) o GraphQL (cuelga de `context.reply.request`).
export function requestOf(context: ExecutionContext): FastifyRequest {
  return context.getType<string>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext<{ reply: { request: FastifyRequest } }>().reply.request
    : context.switchToHttp().getRequest<FastifyRequest>();
}
