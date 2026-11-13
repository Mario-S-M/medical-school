import axios from 'axios';
import { refreshSession } from '../../features/auth/api/refresh-session';
import { useSessionStore } from '../../features/auth/store/session-store';
import { toApiError } from './to-api-error';

export const API_V1 = '/api/v1';
export const GRAPHQL = '/api/graphql';

// Mismo origen: la cookie `token_renovacion` (HttpOnly, SameSite=Strict) viaja sola.
export const api = axios.create({ withCredentials: true });

const currentToken = () => useSessionStore.getState().session?.accessToken;

api.interceptors.request.use((config) => {
  const token = currentToken();
  if (token && !config.skipAuth) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// GraphQL responde 200 con `errors`: se trata igual que un error HTTP.
api.interceptors.response.use((response) => {
  if (!response.data?.errors?.length) return response;
  const error = Object.assign(new Error('graphql'), { isAxiosError: true, response, config: response.config });
  return Promise.reject(error);
});

// Si el token de acceso venció (15 min), renueva la sesión y reintenta una sola vez.
api.interceptors.response.use(undefined, async (error) => {
  const apiError = toApiError(error);
  const config = error?.config;
  if (apiError.code !== 'TOKEN_INVALIDO' || !config || config.skipAuth || config.retried) throw apiError;
  const used = String(config.headers?.Authorization ?? '');
  if (used === `Bearer ${currentToken()}`) await refreshSession(true);
  if (!currentToken()) throw apiError;
  return api({ ...config, retried: true });
});

// Convierte cualquier fallo de la petición en ApiError (los reintentos del interceptor ya lo hacen para TOKEN_INVALIDO).
export const request = async <T>(config: Parameters<typeof api.request>[0]): Promise<T> => {
  try {
    return (await api.request<T>(config)).data;
  } catch (e) {
    throw toApiError(e);
  }
};
