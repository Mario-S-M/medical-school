import type { ZodType } from 'zod';
import { ApiError } from './api-error';

// Valida la respuesta de la API con Zod; un contrato roto se reporta como error genérico de la API.
export function parseResponse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.error('Respuesta de la API fuera de contrato', result.error.issues);
  throw new ApiError(200, 'RESPUESTA_INVALIDA', 'La respuesta de la API no cumple el contrato.');
}
