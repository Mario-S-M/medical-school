import { z } from 'zod';
import { sectionSchema } from './syllabus-schema';

export const levelSchema = z.enum(['basico', 'intermedio', 'avanzado']);

export const courseStateSchema = z.enum(['borrador', 'en_revision', 'publicado']);
export type CourseState = z.infer<typeof courseStateSchema>;

const summaryFields = {
  id: z.number(),
  slug: z.string(),
  titulo: z.string(),
  estado: courseStateSchema,
  comentario_revision: z.string().nullish(),
  portada_ruta: z.string().nullish(),
  actualizado_en: z.string(),
};

export const courseSummarySchema = z.object({ ...summaryFields, es_mio: z.boolean(), instructor: z.string() });
export const myCoursesSchema = z.array(courseSummarySchema);
export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const courseEditSchema = z.object({
  ...summaryFields,
  subtitulo: z.string().nullish(),
  descripcion: z.string().nullish(),
  conocimientos_previos: z.string().nullish(),
  lo_que_aprenderas: z.array(z.string()),
  nivel: levelSchema.nullish(),
  categoria_id: z.number().nullish(),
  secciones: z.array(sectionSchema),
  es_dueno: z.boolean(),
});
export type CourseEdit = z.infer<typeof courseEditSchema>;

export type CourseData = Partial<Omit<CourseEdit, 'id' | 'secciones' | 'es_dueno'>> & { curso_id: number };

export const idSchema = z.object({ id: z.number() });
export const createdCourseSchema = z.object({ id: z.number(), slug: z.string() });
export const stateResultSchema = z.object({ estado: z.string() });
export const coverSignatureSchema = z.object({ url_subida: z.string(), ruta: z.string() });
