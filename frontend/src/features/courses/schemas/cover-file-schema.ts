import { z } from 'zod';

export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const COVER_MAX_BYTES = 2 * 1024 * 1024;

export const coverFileSchema = z.object({
  type: z.string().refine((type) => COVER_TYPES.includes(type), 'La portada debe ser una imagen JPG, PNG o WebP.'),
  size: z.number().max(COVER_MAX_BYTES, 'La portada no puede pesar más de 2 MB.'),
});
