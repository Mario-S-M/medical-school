import { API_V1, request } from '../../../shared/api/client';
import { parseResponse } from '../../../shared/api/parse';
import { messageSchema, sessionResponseSchema } from '../schemas/session-schema';

type Email = { correo: string };

const post = (path: string, body?: unknown, extra = {}) => request<unknown>({ method: 'POST', url: `${API_V1}/${path}`, data: body, ...extra });
const message = async (path: string, body: unknown) => parseResponse(messageSchema, await post(path, body));

export const register = (d: Email & { nombre: string; contrasena: string }) => message('usuarios', d);
export const verifyEmail = (d: Email & { codigo: string }) => message('verificaciones-correo', d);
export const resendVerification = (d: Email) => message('verificaciones-correo/reenvio', d);
export const recover = (d: Email) => message('recuperaciones', d);
export const resetPassword = (d: Email & { codigo: string; contrasena_nueva: string }) => message('recuperaciones/restablecimiento', d);

export const login = async (d: Email & { contrasena: string }) => parseResponse(sessionResponseSchema, await post('sesiones', d));

// La renovación usa la cookie de renovación y la cabecera `X-Solicitado-Con`, no el token de acceso.
export const renew = async () =>
  parseResponse(sessionResponseSchema, await post('sesiones/renovacion', undefined, { skipAuth: true, headers: { 'X-Solicitado-Con': 'front' } }));

export const logout = () => request<void>({ method: 'DELETE', url: `${API_V1}/sesiones/actual` });
