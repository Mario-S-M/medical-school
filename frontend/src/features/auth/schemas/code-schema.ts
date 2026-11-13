import { z } from 'zod';
import { zodValidator } from '../../../shared/lib/zod-validator';

export const codeSchema = z.string().regex(/^\d{6}$/, 'El código tiene exactamente 6 dígitos.');

export const validateCode = zodValidator(codeSchema);
