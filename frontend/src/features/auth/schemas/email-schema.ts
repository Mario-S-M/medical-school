import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

const INVALID = 'Escribe un correo válido.';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo.')
  .max(254, INVALID)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, INVALID);

export const validateEmail = zodValidator(emailSchema);
