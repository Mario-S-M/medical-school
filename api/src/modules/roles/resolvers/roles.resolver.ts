import { Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { Authenticated } from '../../graphql/decorators/authenticated.decorator';
import { MyRoles } from '../models/my-roles.model';
import { RolesService } from '../services/roles.service';

@Resolver(() => MyRoles)
export class RolesResolver {
  constructor(private readonly roles: RolesService) {}

  // Un usuario nuevo recibe `{ roles: [], equipos: [] }`. El menú de la cabecera del front lo usa para sus enlaces.
  @Query(() => MyRoles, { name: 'mis_roles', description: 'Roles de la persona que hace la petición y sus equipos de apoyo.' })
  @Authenticated()
  async myRoles(@CurrentUser() user: AuthenticatedUser): Promise<MyRoles> {
    const [roles, teams] = await Promise.all([this.roles.findRoles(user.id), this.roles.findTeams(user.id)]);
    return { roles, teams };
  }
}
