import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

export const categoryNameSchema = z
  .string()
  .refine((v) => v.trim().length >= 2 && v.trim().length <= 60, 'El nombre debe tener entre 2 y 60 caracteres.')
  .refine((v) => /[\p{L}\p{N}]/u.test(v.trim()), 'Incluye al menos una letra o un número.');

export const positionSchema = z.string().refine((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000;
}, 'La posición es un número entero de 1 a 1000.');

export const reviewCommentSchema = z.string().refine((v) => v.trim(), 'Explica al instructor qué debe cambiar.');
export const retireReasonSchema = z.string().refine((v) => v.trim(), 'Explica al instructor por qué se retira.');

export const validateCategoryName = zodValidator(categoryNameSchema);
export const validatePosition = zodValidator(positionSchema);
export const validateReviewComment = zodValidator(reviewCommentSchema);
export const validateRetireReason = zodValidator(retireReasonSchema);
