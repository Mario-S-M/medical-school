import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { EditCourseArgs } from '../dto/edit-course.args';
import { CourseForEditing, CourseSummary } from '../models/course.models';
import { CoursesRepository, CourseChanges, EditingTree } from '../repositories/courses.repository';
import { courseSlug, firstFreeSlug } from '../utils/course-slug';

const SLUG_ATTEMPTS = 5;

@Injectable()
export class CoursesService {
  constructor(private readonly repository: CoursesRepository) {}

  // El slug se fija aquí y no vuelve a cambiar. Si otro curso lo toma a la vez (índice único) se busca el siguiente libre.
  async create(instructorId: string, title: string): Promise<{ id: number; slug: string }> {
    const base = courseSlug(title);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = firstFreeSlug(base, await this.repository.findTakenSlugs(base));
      if (slug === null) break;
      const created = await this.repository.insert(slug, instructorId, title);
      if (created) return created;
    }
    throw new ApiException(500, 'ERROR_INTERNO');
  }

  // Solo se tocan los campos enviados (`undefined` = no enviado). Un título vacío no se aplica. La categoría debe existir.
  async edit(courseId: number, args: EditCourseArgs): Promise<void> {
    const changes: CourseChanges = {};
    if (args.titulo != null) changes.title = args.titulo;
    if (args.subtitulo !== undefined) changes.subtitle = args.subtitulo;
    if (args.descripcion !== undefined) changes.description = args.descripcion;
    if (args.conocimientos_previos !== undefined) changes.prerequisites = args.conocimientos_previos;
    if (args.lo_que_aprenderas !== undefined) changes.learningOutcomes = args.lo_que_aprenderas ?? [];
    if (args.nivel !== undefined) changes.level = args.nivel;
    if (args.categoria_id !== undefined) changes.categoryId = args.categoria_id;
    if (args.categoria_id != null && !(await this.repository.categoryExists(args.categoria_id))) {
      throw new ApiException(422, 'VALIDACION_FALLIDA', 'Revisa los datos enviados.', [
        { campo: 'categoria_id', regla: 'categoria_inexistente', mensaje: 'La categoría no existe.' },
      ]);
    }
    if (!(await this.repository.update(courseId, changes))) throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
  }

  async listForUser(userId: string): Promise<CourseSummary[]> {
    const rows = await this.repository.listForUser(userId);
    return rows.map((row) => ({
      id: Number(row.id),
      slug: row.slug,
      title: row.titulo,
      status: row.estado,
      reviewComment: row.comentario_revision,
      coverPath: row.portada_ruta,
      updatedAt: row.actualizado_en.toISOString(),
      isMine: row.es_mio,
      instructor: row.instructor,
    }));
  }

  async getForEditing(courseId: number, isOwner: boolean): Promise<CourseForEditing> {
    const tree = await this.repository.findEditingTree(courseId);
    if (!tree) throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    return CoursesService.assemble(tree, isOwner);
  }

  // Arma el árbol del editor. `video` es el vigente; `video_nuevo` el último que aún no lo es (`videos` llega del más nuevo al más viejo).
  static assemble({ course, sections, lessons, videos }: EditingTree, isOwner: boolean): CourseForEditing {
    return {
      id: Number(course.id),
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      prerequisites: course.prerequisites,
      learningOutcomes: course.learningOutcomes,
      level: course.level,
      categoryId: course.categoryId,
      status: course.status,
      reviewComment: course.reviewComment,
      coverPath: course.coverPath,
      updatedAt: course.updatedAt.toISOString(),
      isOwner,
      sections: sections.map((section) => ({
        id: Number(section.id),
        title: section.title,
        position: section.position,
        lessons: lessons
          .filter((lesson) => lesson.sectionId === section.id)
          .map((lesson) => {
            const own = videos.filter((video) => video.lessonId === lesson.id);
            const current = own.find((video) => video.isCurrent);
            const replacement = own.find((video) => !video.isCurrent);
            return {
              id: Number(lesson.id),
              title: lesson.title,
              description: lesson.description,
              estimatedMinutes: lesson.estimatedMinutes,
              isSample: lesson.isSample,
              position: lesson.position,
              video: current ? { status: current.status, durationSeconds: current.durationSeconds } : null,
              newVideo: replacement ? { id: Number(replacement.id), status: replacement.status, error: replacement.error } : null,
            };
          }),
      })),
    };
  }
}
