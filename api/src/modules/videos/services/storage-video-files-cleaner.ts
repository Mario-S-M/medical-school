import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage/services/storage.service';
import { VIDEOS_BUCKET } from '../utils/video-rules';
import { VideoFilesCleaner } from './video-files-cleaner';

// Borra de Storage (bucket `videos`) todo lo que cuelga de la `ruta_base` de cada video. Intenta todas las carpetas aunque
// una falle y no lanza nunca: las filas ya se borraron y un fallo solo deja archivos huérfanos, que se registran sin datos
// sensibles (solo cuántas carpetas fallaron y el tipo de error).
@Injectable()
export class StorageVideoFilesCleaner extends VideoFilesCleaner {
  private readonly logger = new Logger('VideoFilesCleaner');

  constructor(private readonly storage: StorageService) {
    super();
  }

  async deleteFolders(basePaths: string[]): Promise<void> {
    let failed = 0;
    let lastError = '';
    for (const basePath of new Set(basePaths)) {
      try {
        await this.storage.deletePrefix(VIDEOS_BUCKET, basePath);
      } catch (error) {
        failed++;
        lastError = error instanceof Error ? error.name : 'desconocido';
      }
    }
    if (failed > 0) this.logger.error(`No se pudieron borrar los archivos de ${failed} video(s) (${lastError})`);
  }
}
