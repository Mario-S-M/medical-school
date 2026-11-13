import { CoursesService } from './courses.service';
import type { EditingTree } from '../repositories/courses.repository';

const date = new Date('2026-11-12T10:00:00.000Z');
const tree = {
  course: {
    id: '5', slug: 'c', instructorId: 'u', title: 'Curso', subtitle: null, description: null, prerequisites: null, learningOutcomes: ['a'],
    level: null, categoryId: null, status: 'borrador', reviewComment: null, coverPath: null, publishedAt: null, createdAt: date, updatedAt: date, search: '',
  },
  sections: [
    { id: '1', courseId: '5', title: 'S1', position: 1 },
    { id: '2', courseId: '5', title: 'S2', position: 2 },
  ],
  lessons: [
    { id: '11', sectionId: '1', title: 'L1', description: null, estimatedMinutes: 5, isSample: true, position: 1 },
    { id: '12', sectionId: '1', title: 'L2', description: 'd', estimatedMinutes: null, isSample: false, position: 2 },
  ],
  // del más nuevo al más viejo, como los devuelve el repositorio
  videos: [
    { id: '33', lessonId: '11', status: 'error', isCurrent: false, durationSeconds: null, error: 'falló' },
    { id: '22', lessonId: '11', status: 'listo', isCurrent: true, durationSeconds: 90, error: null },
    { id: '21', lessonId: '11', status: 'error', isCurrent: false, durationSeconds: null, error: 'viejo' },
  ],
} as unknown as EditingTree;

describe('CoursesService.assemble', () => {
  const result = CoursesService.assemble(tree, true);

  it('arma secciones[].clases[] en orden con ids numéricos y la fecha ISO', () => {
    expect(result.id).toBe(5);
    expect(result.updatedAt).toBe('2026-11-12T10:00:00.000Z');
    expect(result.isOwner).toBe(true);
    expect(result.sections.map((s) => [s.id, s.lessons.map((l) => l.id)])).toEqual([[1, [11, 12]], [2, []]]);
  });

  it('video es el vigente y video_nuevo el último que aún no lo es', () => {
    const [first, second] = result.sections[0].lessons;
    expect(first.video).toEqual({ status: 'listo', durationSeconds: 90 });
    expect(first.newVideo).toEqual({ id: 33, status: 'error', error: 'falló' });
    expect(second.video).toBeNull();
    expect(second.newVideo).toBeNull();
  });

  it('nunca incluye una clave de cifrado', () => {
    expect(JSON.stringify(result)).not.toMatch(/clave|key/i);
  });
});
