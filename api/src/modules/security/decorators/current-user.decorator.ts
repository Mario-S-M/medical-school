import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../utils/authenticated-user';

// Uso: `logout(@CurrentUser() user: AuthenticatedUser)` en una ruta con `@UseGuards(JwtGuard)`.
// Sirve igual en REST y en GraphQL (en GraphQL la petición Fastify cuelga de `context.reply.request`).
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
  const request =
    context.getType<string>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext<{ reply: { request: FastifyRequest } }>().reply.request
      : context.switchToHttp().getRequest<FastifyRequest>();
  return request.authenticatedUser;
});
