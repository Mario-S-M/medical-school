import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

export const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);

const maxLength = (max: number, name: string) =>
  z.string().refine((v) => v.trim().length <= max, `${name} admite como máximo ${max} caracteres.`);

export const titleSchema = z.string().refine((v) => v.trim().length >= 5 && v.trim().length <= 120, 'El título debe tener entre 5 y 120 caracteres.');
export const subtitleSchema = maxLength(200, 'El subtítulo');
export const descriptionSchema = maxLength(5000, 'La descripción');
export const prerequisitesSchema = maxLength(2000, 'Los conocimientos previos');

export const learnSchema = z
  .string()
  .refine((v) => lines(v).length <= 10, 'Escribe como máximo 10 puntos.')
  .refine((v) => lines(v).every((l) => l.length <= 150), 'Cada punto admite como máximo 150 caracteres.');

export const validateTitle = zodValidator(titleSchema);
export const validateSubtitle = zodValidator(subtitleSchema);
export const validateDescription = zodValidator(descriptionSchema);
export const validatePrerequisites = zodValidator(prerequisitesSchema);
export const validateLearn = zodValidator(learnSchema);
