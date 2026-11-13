import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException, ERROR_MESSAGES } from '../../../common/utils/api-exception';
import { requestOf } from '../../security/utils/request-of';
import { RolesService } from '../services/roles.service';

export const ROLES_KEY = 'roles_graphql';

// Comprueba en la base que el usuario (ya autenticado por `GraphqlAuthGuard`) tenga uno de los roles de `@Roles(...)`.
// Sin ninguno: SIN_PERMISO (el 403 lógico; en GraphQL sale como `extensions.codigo`). Funciona igual en las rutas REST.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const user = requestOf(context).authenticatedUser;
    if (!user || !(await this.roles.hasAnyRole(user.id, required))) throw new ApiException(403, 'SIN_PERMISO', ERROR_MESSAGES.SIN_PERMISO);
    return true;
  }
}
