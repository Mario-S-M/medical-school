import { Injectable } from '@nestjs/common';
import { ApiException, ERROR_MESSAGES } from '../../../common/utils/api-exception';
import { CourseAccessRepository, CourseAccessRow } from '../repositories/course-access.repository';

// Sobre qué cosa se pide el acceso: el curso mismo o algo que cuelga de él (el curso se resuelve desde la base).
export type AccessTarget = { type: 'course' | 'section' | 'lesson' | 'video'; id: number };

export interface AccessOptions {
  // `owner`: solo el instructor dueño. `owner_or_team`: el dueño o un miembro de su equipo de apoyo.
  mode: 'owner' | 'owner_or_team';
  // `true` para escribir: un curso `en_revision` se rechaza con CURSO_EN_REVISION.
  editable: boolean;
}

export interface AccessGrant {
  course: { id: number; instructorId: string; status: string };
  isOwner: boolean;
}

// Única política de acceso a un curso (junto con la guardia de roles). El rol
// (`@Roles`) lo exige la guardia antes de llegar al resolver; esta clase decide sobre el curso concreto, en este orden:
//   1. el curso no existe -> 404 NO_ENCONTRADO ("El curso no existe.")
//   2. no es del usuario (ni de su equipo, según `mode`) -> 403 SIN_PERMISO
//   3. se quiere editar y está en revisión -> 409 CURSO_EN_REVISION
// Los resolvers la llaman; ninguna otra clase repite estas comprobaciones.
@Injectable()
export class CourseAccessPolicy {
  constructor(private readonly repository: CourseAccessRepository) {}

  async authorize(userId: string, target: AccessTarget, options: AccessOptions): Promise<AccessGrant> {
    const row = await this.repository.findCourse(target.type, target.id, userId);
    return CourseAccessPolicy.decide(row, options);
  }

  // La decisión pura (sin base de datos), para probarla por separado.
  static decide(row: CourseAccessRow | null, options: AccessOptions): AccessGrant {
    if (!row) throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    const allowed = options.mode === 'owner' ? row.isOwner : row.isOwner || row.isTeam;
    if (!allowed) throw new ApiException(403, 'SIN_PERMISO', ERROR_MESSAGES.SIN_PERMISO);
    if (options.editable && row.status === 'en_revision') {
      throw new ApiException(409, 'CURSO_EN_REVISION', 'El curso está en revisión y no se puede editar.');
    }
    return { course: { id: row.id, instructorId: row.instructorId, status: row.status }, isOwner: row.isOwner };
  }
}
