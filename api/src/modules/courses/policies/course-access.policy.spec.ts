import { CourseAccessPolicy } from './course-access.policy';
import type { CourseAccessRow } from '../repositories/course-access.repository';

const row = (changes: Partial<CourseAccessRow> = {}): CourseAccessRow => ({
  id: 7,
  instructorId: 'u-1',
  status: 'borrador',
  isOwner: false,
  isTeam: false,
  ...changes,
});
const decide = (r: CourseAccessRow | null, mode: 'owner' | 'owner_or_team', editable: boolean) => () => CourseAccessPolicy.decide(r, { mode, editable });
const failure = (status: number, code: string) => expect.objectContaining({ code, status });

describe('CourseAccessPolicy.decide', () => {
  it('un curso que no existe da NO_ENCONTRADO (404) antes que cualquier permiso', () => {
    expect(decide(null, 'owner', true)).toThrow(failure(404, 'NO_ENCONTRADO'));
    expect(decide(null, 'owner', true)).toThrow('El curso no existe.');
  });

  it('el dueño pasa en ambos modos y se marca como dueño', () => {
    expect(CourseAccessPolicy.decide(row({ isOwner: true }), { mode: 'owner', editable: true })).toEqual({
      course: { id: 7, instructorId: 'u-1', status: 'borrador' },
      isOwner: true,
    });
    expect(CourseAccessPolicy.decide(row({ isOwner: true }), { mode: 'owner_or_team', editable: true }).isOwner).toBe(true);
  });

  it('el equipo de apoyo pasa solo en owner_or_team y no cuenta como dueño', () => {
    expect(CourseAccessPolicy.decide(row({ isTeam: true }), { mode: 'owner_or_team', editable: true }).isOwner).toBe(false);
    expect(decide(row({ isTeam: true }), 'owner', true)).toThrow(failure(403, 'SIN_PERMISO'));
  });

  it('un tercero recibe SIN_PERMISO (403) en ambos modos', () => {
    expect(decide(row(), 'owner', false)).toThrow(failure(403, 'SIN_PERMISO'));
    expect(decide(row(), 'owner_or_team', false)).toThrow(failure(403, 'SIN_PERMISO'));
  });

  it('en_revision rechaza la edición (409) pero no la lectura', () => {
    const inReview = row({ isOwner: true, status: 'en_revision' });
    expect(decide(inReview, 'owner_or_team', true)).toThrow(failure(409, 'CURSO_EN_REVISION'));
    expect(decide(inReview, 'owner_or_team', true)).toThrow('El curso está en revisión y no se puede editar.');
    expect(CourseAccessPolicy.decide(inReview, { mode: 'owner_or_team', editable: false }).course.status).toBe('en_revision');
  });

  it('el permiso va antes que el estado: un tercero no se entera de que está en revisión', () => {
    expect(decide(row({ status: 'en_revision' }), 'owner_or_team', true)).toThrow(failure(403, 'SIN_PERMISO'));
  });

  it('un curso publicado sí se edita', () => {
    expect(CourseAccessPolicy.decide(row({ isOwner: true, status: 'publicado' }), { mode: 'owner', editable: true }).course.status).toBe('publicado');
  });
});
