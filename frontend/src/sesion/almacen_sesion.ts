import type { Usuario } from '../api/tipos';

export type Sesion = { token_acceso: string; usuario: Usuario };
export type EstadoSesion = { estado: 'cargando' | 'autenticada' | 'anonima'; sesion: Sesion | null };

let actual: EstadoSesion = { estado: 'cargando', sesion: null };
const oyentes = new Set<() => void>();

export const leerSesion = () => actual;

export function guardarSesion(sesion: Sesion | null) {
  actual = sesion ? { estado: 'autenticada', sesion } : { estado: 'anonima', sesion: null };
  oyentes.forEach((avisar) => avisar());
}

export function suscribirSesion(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
