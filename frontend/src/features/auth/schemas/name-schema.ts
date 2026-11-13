import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu nombre.')
  .max(80, 'El nombre admite hasta 80 caracteres.');

export const validateName = zodValidator(nameSchema);
