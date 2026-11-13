import { CourseAccessRepository, CourseAccessRow } from '../../courses/repositories/course-access.repository';
import { RolesService } from '../../roles/services/roles.service';
import { PlayableVideo, PlaybackRepository } from '../repositories/playback.repository';
import { PlaybackAccessService } from './playback-access.service';

const VIDEO: PlayableVideo = { id: 31, lessonId: 7, basePath: 'cursos/1/secciones/2/clases/7/videos/31', durationSeconds: 120 };

interface Scenario {
  lesson?: { isSample: boolean } | null;
  course?: Partial<CourseAccessRow> | null;
  admin?: boolean;
  video?: PlayableVideo | null;
}

function service(s: Scenario) {
  const repository = {
    findLesson: jest.fn().mockResolvedValue(s.lesson === undefined ? { isSample: false } : s.lesson),
    findPlayableByLesson: jest.fn().mockResolvedValue(s.video === undefined ? VIDEO : s.video),
  };
  const course = s.course === undefined ? { id: 1, instructorId: 'i', status: 'publicado', isOwner: false, isTeam: false } : s.course && { id: 1, instructorId: 'i', status: 'publicado', isOwner: false, isTeam: false, ...s.course };
  const courseAccess = { findCourse: jest.fn().mockResolvedValue(course) };
  const roles = { hasAnyRole: jest.fn().mockResolvedValue(s.admin ?? false) };
  return {
    roles,
    repository,
    access: new PlaybackAccessService(repository as unknown as PlaybackRepository, courseAccess as unknown as CourseAccessRepository, roles as unknown as RolesService),
  };
}
const rejects = (s: Scenario, code: string) => expect(service(s).access.authorize('u', 7)).rejects.toMatchObject({ code });

describe('PlaybackAccessService', () => {
  it('una clase muestra de un curso publicado la ve cualquier cuenta (sin consultar roles)', async () => {
    const { access, roles } = service({ lesson: { isSample: true } });
    await expect(access.authorize('u', 7)).resolves.toEqual(VIDEO);
    expect(roles.hasAnyRole).not.toHaveBeenCalled();
  });

  it('una clase que no es muestra, o una muestra de curso en borrador o en revisión, da SIN_PERMISO a una cuenta cualquiera', async () => {
    await rejects({ lesson: { isSample: false } }, 'SIN_PERMISO');
    await rejects({ lesson: { isSample: true }, course: { status: 'borrador' } }, 'SIN_PERMISO');
    await rejects({ lesson: { isSample: true }, course: { status: 'en_revision' } }, 'SIN_PERMISO');
  });

  it('el dueño, el equipo y el administrador ven cualquier clase en cualquier estado del curso', async () => {
    for (const status of ['borrador', 'en_revision', 'publicado']) {
      await expect(service({ course: { status, isOwner: true } }).access.authorize('u', 7)).resolves.toEqual(VIDEO);
      await expect(service({ course: { status, isTeam: true } }).access.authorize('u', 7)).resolves.toEqual(VIDEO);
      await expect(service({ course: { status }, admin: true }).access.authorize('u', 7)).resolves.toEqual(VIDEO);
    }
  });

  it('la clase o el curso inexistentes dan NO_ENCONTRADO', async () => {
    await rejects({ lesson: null }, 'NO_ENCONTRADO');
    await rejects({ course: null }, 'NO_ENCONTRADO');
  });

  it('sin video vigente y listo da VIDEO_NO_DISPONIBLE (409) solo a quien tiene permiso', async () => {
    await expect(service({ lesson: { isSample: true }, video: null }).access.authorize('u', 7)).rejects.toMatchObject({
      code: 'VIDEO_NO_DISPONIBLE',
      apiMessage: 'El video de esta clase todavía no está listo.',
      status: 409,
    });
    await rejects({ lesson: { isSample: false }, video: null }, 'SIN_PERMISO');
  });
});
