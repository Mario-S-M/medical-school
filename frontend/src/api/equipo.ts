import { solicitar } from './cliente';
import type { InvitacionRecibida, MiEquipo } from './tipos_equipo';

const ESCUELA = { prefijo: 'escuela' };

export const miEquipo = (token: string) => solicitar<MiEquipo>('GET', 'mi-equipo', { token, ...ESCUELA });

export const invitarEquipo = (token: string, correo: string) =>
  solicitar<{ id: number; expira_en: string; correo_enviado: boolean }>('POST', 'invitar-equipo', { token, cuerpo: { correo }, ...ESCUELA });

export const cancelarInvitacion = (token: string, invitacion_id: number) =>
  solicitar<void>('POST', 'cancelar-invitacion', { token, cuerpo: { invitacion_id }, ...ESCUELA });

export const quitarMiembro = (token: string, miembro_id: string) =>
  solicitar<void>('POST', 'quitar-miembro', { token, cuerpo: { miembro_id }, ...ESCUELA });

export const misInvitaciones = (token: string) =>
  solicitar<{ invitaciones: InvitacionRecibida[] }>('GET', 'mis-invitaciones', { token, ...ESCUELA });

export const responderInvitacion = (token: string, invitacion_id: number, aceptar: boolean) =>
  solicitar<{ aceptada: boolean }>('POST', 'responder-invitacion', { token, cuerpo: { invitacion_id, aceptar }, ...ESCUELA });
