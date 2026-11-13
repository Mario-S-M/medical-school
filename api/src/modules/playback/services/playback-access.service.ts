import { Injectable } from '@nestjs/common';
import { ApiException, ERROR_MESSAGES } from '../../../common/utils/api-exception';
import { CourseAccessRepository } from '../../courses/repositories/course-access.repository';
import { RolesService } from '../../roles/services/roles.service';
import { PlayableVideo, PlaybackRepository } from '../repositories/playback.repository';

// Reglas de acceso a la reproducción (SPEC 12). Las decide la API, nunca el front. Una cuenta con sesión puede ver una clase si:
//   - la clase es muestra y su curso está publicado, o
//   - es el instructor dueño del curso, su equipo de apoyo o un administrador (cualquier clase, en cualquier estado del curso).
// Orden de los errores: la clase no existe -> 404 NO_ENCONTRADO; sin permiso -> 403 SIN_PERMISO; sin video vigente y `listo`
// -> 409 VIDEO_NO_DISPONIBLE (así quien no tiene permiso no averigua el estado del video).
@Injectable()
export class PlaybackAccessService {
  constructor(
    private readonly repository: PlaybackRepository,
    private readonly courseAccess: CourseAccessRepository,
    private readonly roles: RolesService,
  ) {}

  async authorize(userId: string, lessonId: number): Promise<PlayableVideo> {
    const lesson = await this.repository.findLesson(lessonId);
    const course = lesson ? await this.courseAccess.findCourse('lesson', lessonId, userId) : null;
    if (!lesson || !course) throw new ApiException(404, 'NO_ENCONTRADO', 'La clase no existe.');

    const allowed =
      (lesson.isSample && course.status === 'publicado') ||
      course.isOwner ||
      course.isTeam ||
      (await this.roles.hasAnyRole(userId, ['administrador']));
    if (!allowed) throw new ApiException(403, 'SIN_PERMISO', ERROR_MESSAGES.SIN_PERMISO);

    const video = await this.repository.findPlayableByLesson(lessonId);
    if (!video) throw new ApiException(409, 'VIDEO_NO_DISPONIBLE', ERROR_MESSAGES.VIDEO_NO_DISPONIBLE);
    return video;
  }
}
