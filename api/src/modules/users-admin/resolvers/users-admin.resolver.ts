import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { Roles } from '../../roles/decorators/roles.decorator';
import { AssignRoleArgs } from '../dto/assign-role.args';
import { SearchUserArgs } from '../dto/search-user.args';
import { AssignedRole, ManagedUser } from '../models/managed-user.model';
import { UsersAdminService } from '../services/users-admin.service';

@Resolver(() => ManagedUser)
export class UsersAdminResolver {
  constructor(private readonly users: UsersAdminService) {}

  // La pantalla *Roles* lo usa para encontrar a quién dar o quitar el rol.
  @Query(() => ManagedUser, { name: 'buscar_usuario', description: 'Busca una cuenta por su correo exacto (administrador).' })
  @Roles('administrador')
  searchUser(@Args() args: SearchUserArgs): Promise<ManagedUser> {
    return this.users.search(args.correo);
  }

  @Mutation(() => AssignedRole, { name: 'asignar_rol', description: 'Da o quita el rol instructor o administrador (administrador).' })
  @Roles('administrador')
  async assignRole(@CurrentUser() admin: AuthenticatedUser, @Args() args: AssignRoleArgs): Promise<AssignedRole> {
    await this.users.assign(admin.id, args.usuario_id, args.rol, args.activo);
    return { usuario_id: args.usuario_id, rol: args.rol, activo: args.activo };
  }
}
