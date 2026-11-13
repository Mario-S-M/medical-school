import { ApiError } from '../../../shared/api/api-error';
import { errorMessage } from '../../../shared/api/error-messages';

// En el reproductor estos códigos tienen un texto propio (el mapa compartido es más genérico).
const MESSAGES: Record<string, string> = {
  SIN_PERMISO: 'Esta clase no está disponible para tu cuenta.',
  NO_ENCONTRADO: 'La clase no existe o ya no está disponible.',
};

export const playbackMessage = (error: unknown) => (error instanceof ApiError && MESSAGES[error.code]) || errorMessage(error);
