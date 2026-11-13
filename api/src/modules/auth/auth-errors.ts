import { ApiException, ErrorDetail } from '../../common/utils/api-exception';
import { INVALID_REQUEST_MESSAGE } from './validators/request.validators';

export const REFRESH_COOKIE = 'token_renovacion';
export const COOKIE_PATH = '/api/v1/sesiones';
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const ATTRIBUTES = `HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}`;

// Atributo `Secure` fuera de alcance (SPEC 09: sin TLS por ahora).
export const refreshCookie = (value: string): string => `${REFRESH_COOKIE}=${value}; ${ATTRIBUTES}; Max-Age=${SEVEN_DAYS_SECONDS}`;
export const clearedCookie = (): string => `${REFRESH_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;

// Mensajes y códigos de error de la API de autenticación (el front los consume).
export const validationFailed = (details: ErrorDetail[]): ApiException =>
  new ApiException(422, 'VALIDACION_FALLIDA', INVALID_REQUEST_MESSAGE, details);

export const insecurePassword = (details: ErrorDetail[]): ApiException =>
  new ApiException(422, 'CONTRASENA_INSEGURA', 'La contraseña no cumple los requisitos.', details);

export const genericTooManyAttempts = (): ApiException =>
  new ApiException(429, 'DEMASIADOS_INTENTOS', 'Demasiadas solicitudes. Inténtalo más tarde.');

export const invalidCredentials = (): ApiException =>
  new ApiException(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');

export const emailNotVerified = (): ApiException =>
  new ApiException(403, 'CORREO_NO_VERIFICADO', 'Debes verificar tu correo antes de iniciar sesión.');

export const INVALID_SESSION_MESSAGE = 'La sesión no es válida o expiró. Inicia sesión de nuevo.';
// Sin cookie (o con una de formato imposible) no hay nada que borrar.
export const invalidSessionWithoutCookie = (): ApiException => new ApiException(401, 'TOKEN_INVALIDO', INVALID_SESSION_MESSAGE);
// Cuando Supabase rechaza el token de renovación, la respuesta también borra la cookie.
export const invalidSession = (): ApiException =>
  new ApiException(401, 'TOKEN_INVALIDO', INVALID_SESSION_MESSAGE, undefined, undefined, { 'Set-Cookie': clearedCookie() });
