import { z } from 'zod';
import { sectionSchema } from '../../courses/schemas/syllabus-schema';

export const reviewCourseSchema = z.object({
  id: z.number(),
  slug: z.string(),
  titulo: z.string(),
  subtitulo: z.string().nullish(),
  descripcion: z.string().nullish(),
  conocimientos_previos: z.string().nullish(),
  lo_que_aprenderas: z.array(z.string()),
  nivel: z.string().nullish(),
  categoria: z.string().nullish(),
  portada_ruta: z.string().nullish(),
  instructor: z.string(),
  actualizado_en: z.string(),
  secciones: z.array(sectionSchema),
});
export type ReviewCourse = z.infer<typeof reviewCourseSchema>;
export const reviewCoursesSchema = z.array(reviewCourseSchema);

export type Decision = { curso_id: number; aprobar: boolean; comentario?: string };

export const searchedUserSchema = z.object({
  id: z.string(),
  correo: z.string(),
  nombre: z.string().nullish(),
  verificado: z.boolean(),
  roles: z.array(z.string()),
});
export type SearchedUser = z.infer<typeof searchedUserSchema>;
export type AssignableRole = 'instructor' | 'administrador';
export type RoleChange = { usuario_id: string; rol: AssignableRole; activo: boolean };
export const roleChangeSchema = z.object({ usuario_id: z.string(), rol: z.string(), activo: z.boolean() });
