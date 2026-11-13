import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

export const syllabusTitleSchema = z
  .string()
  .refine((v) => v.trim().length >= 1 && v.trim().length <= 120, 'El título debe tener entre 1 y 120 caracteres.');

export const lessonDescriptionSchema = z
  .string()
  .refine((v) => v.trim().length <= 2000, 'La descripción admite como máximo 2000 caracteres.');

// Vacío es válido (la duración estimada es opcional).
export const durationSchema = z.string().refine((v) => {
  if (!v.trim()) return true;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 180;
}, 'La duración es un número entero de minutos, de 1 a 180.');

export const validateSyllabusTitle = zodValidator(syllabusTitleSchema);
export const validateLessonDescription = zodValidator(lessonDescriptionSchema);
export const validateDuration = zodValidator(durationSchema);
