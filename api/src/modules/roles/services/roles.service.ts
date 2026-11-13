import { Injectable } from '@nestjs/common';
import { RolesRepository, TeamSummary } from '../repositories/roles.repository';

// Los roles de la plataforma salen de la base (`escuela.roles_usuario`), no del token: el claim `role` de Supabase solo dice
// `authenticated`. Todo permiso por rol pasa por aquí (`@Roles(...)` lo usa); el estudiante es implícito y no se guarda.
@Injectable()
export class RolesService {
  constructor(private readonly repository: RolesRepository) {}

  findRoles(userId: string): Promise<string[]> {
    return this.repository.findRoles(userId);
  }

  findTeams(userId: string): Promise<TeamSummary[]> {
    return this.repository.findTeams(userId);
  }

  // Basta con uno de los roles pedidos.
  hasAnyRole(userId: string, roles: string[]): Promise<boolean> {
    return roles.length === 0 ? Promise.resolve(true) : this.repository.hasAnyRole(userId, roles);
  }

  applyRole(userId: string, role: string, active: boolean, assignedBy: string, publicName: string): Promise<void> {
    return this.repository.applyRole(userId, role, active, assignedBy, publicName);
  }
}
