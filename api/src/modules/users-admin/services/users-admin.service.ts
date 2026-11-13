import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { RolesService } from '../../roles/services/roles.service';
import { AssignableRole } from '../dto/assign-role.args';
import { AuthAdminService } from './auth-admin.service';

export interface FoundUser {
  id: string;
  correo: string;
  nombre: string | null;
  verificado: boolean;
  roles: string[];
}

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly authAdmin: AuthAdminService,
    private readonly roles: RolesService,
  ) {}

  // `email` ya viene recortado y en minúsculas.
  async search(email: string): Promise<FoundUser> {
    const account = await this.authAdmin.findByEmail(email);
    if (!account) throw new ApiException(404, 'NO_ENCONTRADO', 'No hay ninguna cuenta con ese correo.');
    return { id: account.id, correo: account.email, nombre: account.name, verificado: account.verified, roles: await this.roles.findRoles(account.id) };
  }

  // Da o quita `instructor` o `administrador`. Un administrador no puede quitarse a sí mismo el rol (la escuela nunca se
  // queda sin administradores); eso se comprueba antes de consultar la cuenta.
  async assign(adminId: string, userId: string, role: AssignableRole, active: boolean): Promise<void> {
    if (role === 'administrador' && !active && userId === adminId) {
      throw new ApiException(409, 'ESTADO_INVALIDO', 'No puedes quitarte a ti mismo el rol de administrador.');
    }
    const account = await this.authAdmin.findById(userId);
    if (!account) throw new ApiException(404, 'NO_ENCONTRADO', 'La cuenta no existe.');
    // Nombre público del instructor: `user_metadata.nombre`, o la parte local del correo, o "Instructor" (máx. 80).
    const publicName = (account.name ?? (account.email.split('@')[0] || 'Instructor')).slice(0, 80);
    await this.roles.applyRole(userId, role, active, adminId, publicName);
  }
}
