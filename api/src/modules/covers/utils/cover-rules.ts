import { randomUUID } from 'node:crypto';
import { ApiException } from '../../../common/utils/api-exception';

export const COVERS_BUCKET = 'portadas';
export const MAX_COVER_BYTES = 2_097_152;
export const COVER_EXTENSIONS: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const invalidCover = (message: string): ApiException => new ApiException(422, 'PORTADA_INVALIDA', message);

// Tipo y tamaño de una portada que se va a subir (workflow `url-de-subida-de-portada`).
export function assertCoverUpload(contentType: string, sizeBytes: number): string {
  const extension = COVER_EXTENSIONS[contentType];
  if (!extension) throw invalidCover('La portada debe ser una imagen JPG, PNG o WebP.');
  if (sizeBytes > MAX_COVER_BYTES) throw invalidCover('La portada no puede pesar más de 2 MB.');
  return extension;
}

// `cursos/<curso_id>/portada-<32 hex>.<ext>`: el azar de la ruta es un UUID sin guiones.
export function newCoverPath(courseId: number, extension: string): string {
  return `cursos/${courseId}/portada-${randomUUID().replaceAll('-', '')}.${extension}`;
}

// La ruta que se confirma debe ser de este curso y tener la forma que da `newCoverPath`.
export function isCoverPathOf(courseId: number, path: string): boolean {
  return new RegExp(`^cursos/${courseId}/portada-[0-9a-f]{32}\\.(jpg|png|webp)$`).test(path);
}

// El objeto que Storage informa debe ser una imagen permitida de hasta 2 MB (workflow `confirmar-portada`).
export function assertStoredCover(info: { contentType: string; size: number } | null): void {
  if (!info) throw invalidCover('La portada todavía no se subió.');
  if (!COVER_EXTENSIONS[info.contentType] || info.size > MAX_COVER_BYTES) {
    throw invalidCover('La portada debe ser una imagen JPG, PNG o WebP de hasta 2 MB.');
  }
}
