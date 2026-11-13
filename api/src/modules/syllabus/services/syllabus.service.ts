import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { VideoFilesCleaner } from '../../videos/services/video-files-cleaner';
import { LessonFields, SyllabusRepository } from '../repositories/syllabus.repository';
import { Direction } from '../utils/reorder';

// Lógica del temario. El acceso al curso ya lo decidió `CourseAccessPolicy` en el resolver; aquí llega el `courseId` resuelto.
@Injectable()
export class SyllabusService {
  private readonly logger = new Logger(SyllabusService.name);

  constructor(
    private readonly repository: SyllabusRepository,
    private readonly videoFiles: VideoFilesCleaner,
  ) {}

  async saveSection(courseId: number, sectionId: number | null, title: string): Promise<number> {
    const id = await this.repository.saveSection(courseId, sectionId, title);
    if (id === null) throw new ApiException(404, 'NO_ENCONTRADO', 'La sección no existe en este curso.');
    return id;
  }

  async deleteSection(courseId: number, sectionId: number): Promise<void> {
    const paths = await this.repository.deleteSection(courseId, sectionId);
    if (paths === null) throw new ApiException(404, 'NO_ENCONTRADO', 'La sección no existe en este curso.');
    await this.cleanFiles(paths);
  }

  async saveLesson(courseId: number, sectionId: number, lessonId: number | null, fields: LessonFields): Promise<number> {
    const id = await this.repository.saveLesson(courseId, sectionId, lessonId, fields);
    if (id === null) throw new ApiException(404, 'NO_ENCONTRADO', 'La clase no existe en este curso.');
    return id;
  }

  async deleteLesson(courseId: number, lessonId: number): Promise<void> {
    const paths = await this.repository.deleteLesson(courseId, lessonId);
    if (paths === null) throw new ApiException(404, 'NO_ENCONTRADO', 'La clase no existe en este curso.');
    await this.cleanFiles(paths);
  }

  async move(courseId: number, type: 'seccion' | 'clase', id: number, direction: Direction): Promise<void> {
    const outcome = await this.repository.move(courseId, type, id, direction);
    if (outcome === 'not_found') throw new ApiException(404, 'NO_ENCONTRADO', 'El elemento no existe en este curso.');
  }

  // Las filas ya se borraron; si el borrado de archivos falla no se deshace nada (queda en el registro para limpiarlos).
  private async cleanFiles(basePaths: string[]): Promise<void> {
    if (basePaths.length === 0) return;
    try {
      await this.videoFiles.deleteFolders(basePaths);
    } catch (error) {
      this.logger.error(`No se pudieron borrar los archivos de ${basePaths.length} video(s): ${error instanceof Error ? error.message : 'error'}`);
    }
  }
}
