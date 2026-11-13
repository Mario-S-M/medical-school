import { isAxiosError } from 'axios';
import { ApiError } from './api-error';

type GraphqlError = { message?: string; extensions?: { codigo?: unknown; detalles?: ApiError['details'] } };
type Body = {
  error?: { codigo?: string; mensaje?: string; detalles?: ApiError['details']; reintentar_en_segundos?: number };
  errors?: GraphqlError[];
};

// GraphQL responde 200 con `errors`: el estado HTTP lógico sale del código (el reintento de TanStack Query no repite los 4xx).
const LOGICAL_STATUS: Record<string, number> = {
  TOKEN_INVALIDO: 401, SIN_PERMISO: 403, NO_ENCONTRADO: 404, ERROR_INTERNO: 500,
  VALIDACION_FALLIDA: 422, PORTADA_INVALIDA: 422, VIDEO_INVALIDO: 422, CURSO_INCOMPLETO: 422,
};
const logicalStatus = (code: string) => LOGICAL_STATUS[code] ?? 409;

// Convierte cualquier error de axios (HTTP, red, cuerpo GraphQL) en ApiError con el formato de la SPEC 04.
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError(error) || !error.response) return new ApiError(0, 'RED', 'Sin conexión con el servidor.');
  const { status, data, headers } = error.response;
  const body = (data ?? {}) as Body;
  const e = body.error ?? {};
  const gql = body.errors?.[0];
  const gqlCode = gql?.extensions?.codigo;
  const wait = Number(headers['retry-after']) || undefined;
  const code = e.codigo ?? (typeof gqlCode === 'string' ? gqlCode : 'ERROR_INTERNO');
  const logical = status === 200 && !e.codigo ? logicalStatus(code) : status;
  const details = e.detalles ?? gql?.extensions?.detalles;
  return new ApiError(logical, code, e.mensaje ?? gql?.message ?? '', details, e.reintentar_en_segundos ?? wait);
}
