import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiException } from '../../../common/utils/api-exception';

export const VIDEOS_BUCKET = 'videos';
export const MAX_VIDEO_BYTES = 1_073_741_824;
export const VIDEO_EXTENSIONS: Readonly<Record<string, string>> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
// Un video `en_cola` o `procesando` sin cambios durante este tiempo se trata como `error` al consultar su estado.
export const STALE_MINUTES = 45;
export const STALE_MESSAGE = 'El procesamiento tardó demasiado.';
export const SERVICE_ERROR_MESSAGE = 'El servicio de video no responde. Inténtalo de nuevo.';

export type VideoStatus = 'esperando_archivo' | 'en_cola' | 'procesando' | 'listo' | 'error';

const invalidVideo = (message: string): ApiException => new ApiException(422, 'VIDEO_INVALIDO', message);

// Tipo y tamaño de un video que se va a subir (workflow `solicitar-subida-de-video`): devuelve la extensión del original.
export function assertVideoUpload(contentType: string, sizeBytes: number): string {
  const extension = VIDEO_EXTENSIONS[contentType];
  if (!extension) throw invalidVideo('El video debe ser MP4, MOV o WebM.');
  if (sizeBytes > MAX_VIDEO_BYTES) throw invalidVideo('El video no puede pesar más de 1 GiB.');
  return extension;
}

// `<ruta_base>/original.<ext>`: el original vive aquí solo mientras se procesa (o si el procesado falló).
export function originalPath(basePath: string, contentType: string): string {
  return `${basePath}/original.${VIDEO_EXTENSIONS[contentType]}`;
}

// `cursos/<curso>/secciones/<sección>/clases/<clase>/<video>`: la misma forma que exige el transcodificador.
export function videoBasePath(lessonFolder: string, videoId: number | string): string {
  return `${lessonFolder}/${videoId}`;
}

export interface DeclaredVideo {
  contentType: string;
  sizeBytes: number;
}

// El objeto que informa Storage debe existir y coincidir con lo declarado al firmar (workflow `encolar-video`).
export function assertStoredVideo(info: { contentType: string; size: number } | null, declared: DeclaredVideo, retrying: boolean): void {
  if (!info) throw invalidVideo(retrying ? 'El archivo original ya no está: sube el video otra vez.' : 'El video todavía no se subió.');
  if (info.size !== declared.sizeBytes || info.contentType !== declared.contentType) throw invalidVideo('El archivo subido no coincide con lo declarado.');
}

// Transiciones permitidas: `esperando_archivo` -> `en_cola` (al confirmar) -> `listo` | `error`; `error` -> `en_cola` (al reintentar).
// El transcodificador puede dejar el video en `procesando` entre medias. `listo` y el resto no admiten otro paso.
const TRANSITIONS: Readonly<Record<VideoStatus, readonly VideoStatus[]>> = {
  esperando_archivo: ['en_cola'],
  en_cola: ['procesando', 'listo', 'error'],
  procesando: ['listo', 'error'],
  listo: [],
  error: ['en_cola'],
};
export const canTransition = (from: VideoStatus, to: VideoStatus): boolean => TRANSITIONS[from].includes(to);

// ¿Ya pasó el tiempo máximo sin cambios? (la regla real corre en SQL; esta versión la documenta y se prueba aparte).
export const isStale = (status: VideoStatus, updatedAt: Date, now: Date = new Date()): boolean =>
  (status === 'en_cola' || status === 'procesando') && now.getTime() - updatedAt.getTime() > STALE_MINUTES * 60_000;

// Comparación en tiempo constante: se comparan los resúmenes SHA-256 (misma longitud siempre) para no filtrar la longitud.
export function constantTimeEquals(received: string | undefined, expected: string): boolean {
  if (typeof received !== 'string') return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
