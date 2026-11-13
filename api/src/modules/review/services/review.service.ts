import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { CatalogRepository } from '../../catalog/repositories/catalog.repository';
import { CourseState, CourseUnderReview } from '../models/review.models';
import { ReviewRepository } from '../repositories/review.repository';
import { missingDetails } from '../utils/missing';

@Injectable()
export class ReviewService {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  // El acceso (dueño, no `en_revision`) ya lo decidió `CourseAccessPolicy`. Orden de las respuestas, como en el workflow:
  // enviado -> no estaba en borrador (409) -> faltan datos (422 con una `regla` por falta).
  async submit(courseId: number): Promise<CourseState> {
    const result = await this.repository.submit(courseId);
    if (result.submitted) return { status: 'en_revision' };
    if (result.status !== 'borrador') {
      throw new ApiException(409, 'ESTADO_INVALIDO', 'Solo se pueden enviar a revisión los cursos en borrador.');
    }
    if (result.missing.length > 0) {
      throw new ApiException(422, 'CURSO_INCOMPLETO', 'Al curso le faltan datos para enviarlo a revisión.', missingDetails(result.missing));
    }
    throw new ApiException(500, 'ERROR_INTERNO');
  }

  async resolve(courseId: number, approve: boolean, comment: string | null): Promise<CourseState> {
    const result = await this.repository.resolve(courseId, approve, comment);
    if (result === 'ok') return { status: approve ? 'publicado' : 'borrador' };
    if (result === 'not_found') throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    if (result === 'invalid_state') throw new ApiException(409, 'ESTADO_INVALIDO', 'Solo se pueden resolver cursos que están en revisión.');
    throw new ApiException(422, 'VALIDACION_FALLIDA', 'Revisa los datos enviados.', [
      { campo: 'comentario', regla: 'obligatorio_si_se_devuelve', mensaje: 'Explica al instructor qué debe cambiar.' },
    ]);
  }

  async retire(courseId: number, comment: string): Promise<CourseState> {
    const result = await this.repository.retire(courseId, comment);
    if (result === 'ok') return { status: 'borrador' };
    if (result === 'not_found') throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    throw new ApiException(409, 'ESTADO_INVALIDO', 'Solo se pueden retirar los cursos publicados.');
  }

  // Tres consultas por lotes (cursos, secciones, clases), sin N+1.
  async listPending(): Promise<CourseUnderReview[]> {
    const rows = await this.repository.findPending();
    const trees = await this.catalog.findTrees(rows.map((row) => Number(row.id)));
    return rows.map((row) => ({
      id: Number(row.id),
      slug: row.slug,
      title: row.titulo,
      subtitle: row.subtitulo,
      description: row.descripcion,
      prerequisites: row.conocimientos_previos,
      learningOutcomes: row.lo_que_aprenderas,
      level: row.nivel,
      category: row.categoria,
      coverPath: row.portada_ruta,
      instructor: row.instructor,
      updatedAt: row.actualizado_en.toISOString(),
      sections: trees.get(Number(row.id)) ?? [],
    }));
  }
}
