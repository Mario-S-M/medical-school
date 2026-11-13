import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { StorageService } from '../../storage/services/storage.service';
import { CoverSignature } from '../models/cover.models';
import { CoversRepository } from '../repositories/covers.repository';
import { assertCoverUpload, assertStoredCover, COVERS_BUCKET, isCoverPathOf, newCoverPath } from '../utils/cover-rules';

// Portadas de los cursos (workflows `url-de-subida-de-portada` y `confirmar-portada`). El permiso sobre el curso lo decide
// quien llama con `CourseAccessPolicy` (modo dueño, editable); aquí solo están las reglas de la portada.
@Injectable()
export class CoversService {
  private readonly logger = new Logger('CoversService');

  constructor(
    private readonly repository: CoversRepository,
    private readonly storage: StorageService,
  ) {}

  // Firma una subida de un solo uso. La URL lleva el prefijo `/almacen`, por donde el navegador llega a Storage.
  async sign(courseId: number, contentType: string, sizeBytes: number): Promise<CoverSignature> {
    const extension = assertCoverUpload(contentType, sizeBytes);
    const path = newCoverPath(courseId, extension);
    return { url_subida: `/almacen${await this.storage.signUpload(COVERS_BUCKET, path)}`, ruta: path };
  }

  // Comprueba la ruta y el objeto subido, guarda la ruta en el curso y borra la portada anterior del bucket.
  async confirm(courseId: number, path: string): Promise<string> {
    if (!isCoverPathOf(courseId, path)) throw new ApiException(422, 'PORTADA_INVALIDA', 'La ruta de la portada no corresponde a este curso.');
    assertStoredCover(await this.storage.getObjectInfo(COVERS_BUCKET, path));
    const { previous, saved } = await this.repository.replace(courseId, path);
    if (!saved) throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    // La portada nueva ya quedó guardada: si el borrado de la anterior falla, solo queda un archivo huérfano.
    if (previous && previous !== path) {
      await this.storage.deleteObject(COVERS_BUCKET, previous).catch(() => this.logger.warn('No se pudo borrar la portada anterior'));
    }
    return this.storage.publicUrl(COVERS_BUCKET, path);
  }
}
