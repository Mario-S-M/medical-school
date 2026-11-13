import { z } from 'zod';
import { levelSchema } from '../../courses/schemas/course-schema';
import { sectionSchema } from '../../courses/schemas/syllabus-schema';

export const categorySchema = z.object({ id: z.number(), nombre: z.string(), slug: z.string(), posicion: z.number() });
export type Category = z.infer<typeof categorySchema>;
export const categoriesSchema = z.array(categorySchema);

export const courseCardSchema = z.object({
  slug: z.string(),
  titulo: z.string(),
  subtitulo: z.string().nullish(),
  nivel: levelSchema.nullish(),
  categoria: z.string().nullish(),
  categoria_slug: z.string().nullish(),
  instructor: z.string(),
  portada_ruta: z.string().nullish(),
  secciones: z.number(),
  clases: z.number(),
});
export type CourseCardData = z.infer<typeof courseCardSchema>;

export const catalogSchema = z.object({
  cursos: z.array(courseCardSchema),
  total: z.number(),
  pagina: z.number(),
  paginas: z.number(),
});

export type CatalogQuery = { q?: string; categoria?: string; nivel?: string; pagina?: number };

export const courseSheetSchema = z.object({
  id: z.number(),
  slug: z.string(),
  titulo: z.string(),
  subtitulo: z.string().nullish(),
  descripcion: z.string().nullish(),
  conocimientos_previos: z.string().nullish(),
  lo_que_aprenderas: z.array(z.string()),
  nivel: levelSchema.nullish(),
  categoria: z.object({ nombre: z.string(), slug: z.string() }).nullish(),
  portada_ruta: z.string().nullish(),
  instructor: z.string(),
  publicado_en: z.string(),
  secciones: z.array(sectionSchema),
});
