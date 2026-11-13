import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { StorageService } from '../../storage/services/storage.service';
import { VideoProcessedDto } from '../dto/video-processed.dto';
import { CurrentVideo, VideoSignature, VideoStatusResult } from '../models/video.models';
import { VideosRepository } from '../repositories/videos.repository';
import { assertStoredVideo, assertVideoUpload, originalPath, VIDEOS_BUCKET, videoBasePath } from '../utils/video-rules';
import { TranscoderClient } from './transcoder-client.service';
import { VideoFilesCleaner } from './video-files-cleaner';

// Lógica de los videos de clase (workflows de la SPEC 08). El acceso al curso ya lo decidió `CourseAccessPolicy` en quien
// llama; el webhook del transcodificador lo protege su guardia de secreto.
@Injectable()
export class VideosService {
  private readonly logger = new Logger('VideosService');

  constructor(
    private readonly repository: VideosRepository,
    private readonly storage: StorageService,
    private readonly transcoder: TranscoderClient,
    private readonly files: VideoFilesCleaner,
  ) {}

  // Registra el video `esperando_archivo` con su clave AES-128 (16 bytes aleatorios, solo en `claves_video`) y firma la
  // subida directa a Storage. La clave no sale de aquí.
  async sign(lessonId: number, fileName: string, contentType: string, sizeBytes: number): Promise<VideoSignature> {
    assertVideoUpload(contentType, sizeBytes);
    const reserved = await this.repository.reserve(lessonId);
    if (!reserved) throw new ApiException(404, 'NO_ENCONTRADO', 'La clase no existe.');
    const basePath = videoBasePath(reserved.lessonFolder, reserved.id);
    const path = originalPath(basePath, contentType);
    const uploadUrl = `/almacen${await this.storage.signUpload(VIDEOS_BUCKET, path)}`;
    const registered = await this.repository.register({ id: reserved.id, lessonId, originalName: fileName, contentType, sizeBytes, basePath, key: randomBytes(16) });
    if (!registered) throw new ApiException(409, 'VIDEO_EN_PROCESO', 'Esta clase ya tiene un video subiéndose o procesándose.');
    return { video_id: reserved.id, url_subida: uploadUrl, ruta: path };
  }

  // Cierra los videos vencidos (45 minutos) y devuelve el vigente y el último que no lo es.
  async status(lessonId: number): Promise<VideoStatusResult> {
    await this.repository.expireStale(lessonId);
    const rows = await this.repository.statusOf(lessonId);
    const current = rows.find((row) => row.isCurrent);
    const next = rows.find((row) => !row.isCurrent);
    return {
      vigente: current
        ? ({ id: current.id, estado: current.status, duracion_segundos: current.durationSeconds, listo_en: current.readyAt?.toISOString() ?? null } satisfies CurrentVideo)
        : null,
      nuevo: next ? { id: next.id, status: next.status, error: next.error } : null,
    };
  }

  confirm(videoId: number): Promise<void> {
    return this.enqueue(videoId, 'esperando_archivo');
  }

  retry(videoId: number): Promise<void> {
    return this.enqueue(videoId, 'error');
  }

  // Borra el vigente y cualquiera en proceso o con error de la clase, con sus archivos.
  async remove(lessonId: number): Promise<void> {
    const basePaths = await this.repository.deleteByLesson(lessonId);
    if (basePaths.length === 0) throw new ApiException(404, 'NO_ENCONTRADO', 'El video no existe en este curso.');
    await this.files.deleteFolders(basePaths);
  }

  // Webhook del transcodificador. Idempotente: un reintento del aviso o un video borrado entre medias no aplica nada.
  async applyResult(dto: VideoProcessedDto): Promise<{ aplicado: boolean }> {
    const result = await this.repository.applyResult(dto.video_id, dto.resultado, dto.duracion_segundos ?? null, dto.mensaje ?? null);
    if (result.applied && dto.resultado === 'listo') {
      // El nuevo ya es el vigente: los archivos del anterior (y el original, si el transcodificador no lo borró) se limpian aparte.
      await this.files.deleteFolders(result.previousBasePaths);
      if (result.basePath && result.contentType) {
        await this.storage.deleteObject(VIDEOS_BUCKET, originalPath(result.basePath, result.contentType)).catch(() => this.logger.warn('No se pudo borrar el original del video'));
      }
    }
    return { aplicado: result.applied };
  }

  // `confirmar_subida_video` y `reintentar_video` (workflow `encolar-video`): comprueba el estado y el original, pasa a
  // `en_cola` y pide el trabajo al transcodificador; si no lo acepta, el video queda en `error` y se puede reintentar.
  private async enqueue(videoId: number, required: 'esperando_archivo' | 'error'): Promise<void> {
    const video = await this.repository.findForQueue(videoId);
    if (!video) throw new ApiException(404, 'NO_ENCONTRADO', 'El video no existe.');
    const wrongState = (): ApiException =>
      new ApiException(409, 'ESTADO_INVALIDO', required === 'error' ? 'Solo se puede reintentar un video con error.' : 'Este video ya se confirmó.');
    if (video.status !== required) throw wrongState();
    const path = originalPath(video.basePath, video.contentType);
    assertStoredVideo(await this.storage.getObjectInfo(VIDEOS_BUCKET, path), video, required === 'error');
    if (!(await this.repository.markQueued(video.id, required))) throw wrongState();
    const accepted = await this.transcoder.requestJob({ videoId: video.id, originalPath: path, basePath: video.basePath, keyHex: video.keyHex });
    if (accepted) return;
    await this.repository.markServiceError(video.id);
    throw new ApiException(503, 'SERVICIO_NO_DISPONIBLE', 'El servicio de video no responde. Inténtalo de nuevo en unos minutos.');
  }
}
