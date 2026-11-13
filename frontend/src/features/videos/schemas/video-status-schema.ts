import { z } from 'zod';

export const videoStateSchema = z.enum(['esperando_archivo', 'en_cola', 'procesando', 'listo', 'error']);
export type VideoState = z.infer<typeof videoStateSchema>;

const currentVideoSchema = z.object({
  id: z.number(),
  estado: videoStateSchema,
  duracion_segundos: z.number().nullish(),
  listo_en: z.string().nullish(),
});
const newVideoSchema = z.object({ id: z.number(), estado: videoStateSchema, error: z.string().nullish() });

export const videoStatusSchema = z.object({ vigente: currentVideoSchema.nullish(), nuevo: newVideoSchema.nullish() });
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const signedUploadSchema = z.object({ video_id: z.number(), url_subida: z.string(), ruta: z.string() });
export const stateSchema = z.object({ estado: z.string() });

export type UploadRequest = { clase_id: number; nombre_archivo: string; tipo_contenido: string; tamano_bytes: number };
