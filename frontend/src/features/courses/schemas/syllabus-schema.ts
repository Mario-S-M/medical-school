import { z } from 'zod';
import { videoStateSchema } from '../../videos/schemas/video-status-schema';

// Los campos de video solo vienen en el editor; en el temario público faltan (o son null).
export const lessonSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  descripcion: z.string().nullish(),
  duracion_estimada_minutos: z.number().nullish(),
  es_muestra: z.boolean(),
  posicion: z.number().optional(),
  video: z.object({ estado: videoStateSchema, duracion_segundos: z.number().nullish() }).nullish(),
  video_nuevo: z.object({ id: z.number(), estado: videoStateSchema, error: z.string().nullish() }).nullish(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const sectionSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  posicion: z.number(),
  clases: z.array(lessonSchema),
});
export type Section = z.infer<typeof sectionSchema>;

export type LessonData = {
  seccion_id: number;
  clase_id?: number;
  titulo: string;
  descripcion: string | null;
  duracion_estimada_minutos: number | null;
  es_muestra: boolean;
};
export type Movement = { tipo: 'seccion' | 'clase'; id: number; direccion: 'subir' | 'bajar' };
