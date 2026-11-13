import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '../../security/services/jwt.service';
import { requestOf } from '../../security/utils/request-of';

// Guardia de los campos protegidos: verifica el JWT en local (`JwtService`, sin llamar a Supabase Auth) y deja al usuario en
// la petición. Sirve igual en GraphQL y en las rutas REST protegidas con `@Roles`. Los permisos por rol los comprueba `RolesGuard` (módulo `roles`). Los errores salen como `extensions.codigo`.
@Injectable()
export class GraphqlAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = requestOf(context);
    request.authenticatedUser = this.jwt.authenticate(request.headers.authorization); // lanza TOKEN_INVALIDO
    return true;
  }
}
