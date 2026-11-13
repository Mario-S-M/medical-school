import { applyDecorators, UseGuards } from '@nestjs/common';
import { GraphqlAuthGuard } from '../guards/graphql-auth.guard';

// Marca un campo (o un resolver entero) como protegido: sin token válido responde TOKEN_INVALIDO.
export const Authenticated = (): MethodDecorator & ClassDecorator => applyDecorators(UseGuards(GraphqlAuthGuard));
