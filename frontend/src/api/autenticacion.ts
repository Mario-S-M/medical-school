import { solicitar } from './cliente';
import type { Mensaje, RespuestaSesion, Usuario } from './tipos';

type Correo = { correo: string };

export const registro = (d: Correo & { nombre: string; contrasena: string }) =>
  solicitar<Mensaje>('POST', 'registro', { cuerpo: d });

export const verificarCorreo = (d: Correo & { codigo: string }) =>
  solicitar<Mensaje>('POST', 'verificar-correo', { cuerpo: d });

export const reenviarVerificacion = (d: Correo) =>
  solicitar<Mensaje>('POST', 'reenviar-verificacion', { cuerpo: d });

export const iniciarSesion = (d: Correo & { contrasena: string }) =>
  solicitar<RespuestaSesion>('POST', 'iniciar-sesion', { cuerpo: d });

export const renovar = () => solicitar<RespuestaSesion>('POST', 'renovar', { renovacion: true });

export const recuperar = (d: Correo) => solicitar<Mensaje>('POST', 'recuperar', { cuerpo: d });

export const restablecer = (d: Correo & { codigo: string; contrasena_nueva: string }) =>
  solicitar<Mensaje>('POST', 'restablecer', { cuerpo: d });

export const quienSoy = (token: string) => solicitar<Usuario>('GET', 'yo', { token });

export const cerrarSesion = (token: string) => solicitar<void>('POST', 'cerrar-sesion', { token });
