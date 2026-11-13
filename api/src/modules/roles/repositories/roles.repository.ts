import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMember } from '../../team/entities/team-member.entity';
import { InstructorProfile } from '../entities/instructor-profile.entity';
import { UserRole } from '../entities/user-role.entity';

// Equipo de apoyo al que pertenece un usuario; `publicName` es null si el instructor no tiene perfil.
export interface TeamSummary {
  instructorId: string;
  publicName: string | null;
}

@Injectable()
export class RolesRepository {
  constructor(
    @InjectRepository(UserRole) private readonly roles: Repository<UserRole>,
    @InjectRepository(TeamMember) private readonly teams: Repository<TeamMember>,
  ) {}

  async findRoles(userId: string): Promise<string[]> {
    const rows = await this.roles.find({ where: { userId }, order: { role: 'ASC' } });
    return rows.map((row) => row.role);
  }

  async hasAnyRole(userId: string, roles: string[]): Promise<boolean> {
    const found = await this.roles
      .createQueryBuilder('r')
      .select('1')
      .where('r.usuario_id = :userId AND r.rol = ANY(:roles)', { userId, roles })
      .limit(1)
      .getRawOne();
    return found !== undefined;
  }

  // Equipos de apoyo del usuario, del más antiguo al más nuevo.
  async findTeams(userId: string): Promise<TeamSummary[]> {
    const rows = await this.teams
      .createQueryBuilder('e')
      .leftJoin(InstructorProfile, 'p', 'p.usuario_id = e.instructor_id')
      .select('e.instructor_id', 'instructorId')
      .addSelect('p.nombre_publico', 'publicName')
      .where('e.miembro_id = :userId', { userId })
      .orderBy('e.creado_en', 'ASC')
      .getRawMany<TeamSummary>();
    return rows;
  }

  // Da o quita un rol en una sola transacción. Al dar `instructor` guarda (o actualiza) su nombre público.
  // Quitar un rol que no se tiene no es un error; quitar `instructor` conserva el perfil.
  async applyRole(userId: string, role: string, active: boolean, assignedBy: string, publicName: string): Promise<void> {
    await this.roles.manager.transaction(async (manager) => {
      if (!active) {
        await manager.query('DELETE FROM escuela.roles_usuario WHERE usuario_id = $1 AND rol = $2', [userId, role]);
        return;
      }
      await manager.query('INSERT INTO escuela.roles_usuario (usuario_id, rol, asignado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
        userId,
        role,
        assignedBy,
      ]);
      if (role === 'instructor') {
        await manager.query(
          `INSERT INTO escuela.perfiles_instructor (usuario_id, nombre_publico) VALUES ($1, $2)
           ON CONFLICT (usuario_id) DO UPDATE SET nombre_publico = EXCLUDED.nombre_publico, actualizado_en = now()`,
          [userId, publicName],
        );
      }
    });
  }
}
