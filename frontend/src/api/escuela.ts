import { solicitar } from './cliente';

export type Equipo = { instructor_id: string; nombre_publico: string | null };
export type MisRoles = { roles: string[]; equipos: Equipo[] };

export const misRoles = (token: string) =>
  solicitar<MisRoles>('GET', 'mis-roles', { token, prefijo: 'escuela' });
