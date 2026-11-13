import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { GraphqlAuthGuard } from '../../graphql/guards/graphql-auth.guard';
import { ROLES_KEY, RolesGuard } from '../guards/roles.guard';

// Exige un rol de los indicados (basta con uno; SIN_PERMISO si no); ya incluye `@Authenticated()`. Los roles se consultan en
// la base (`escuela.roles_usuario`), no en el token. Sirve en resolvers de GraphQL y en rutas REST (`POST /api/v1/portadas/firmas`). El módulo que lo use debe importar `RolesModule`.
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(GraphqlAuthGuard, RolesGuard));
