import { solicitar } from './cliente';

const ESCUELA = { prefijo: 'escuela' };

export type DatosClase = {
  seccion_id: number;
  clase_id?: number;
  titulo: string;
  descripcion: string | null;
  duracion_estimada_minutos: number | null;
  es_muestra: boolean;
};
export type Movimiento = { tipo: 'seccion' | 'clase'; id: number; direccion: 'subir' | 'bajar' };

export const guardarSeccion = (token: string, cuerpo: { curso_id: number; seccion_id?: number; titulo: string }) =>
  solicitar<{ id: number }>('POST', 'guardar-seccion', { token, cuerpo, ...ESCUELA });

export const borrarSeccion = (token: string, seccion_id: number) =>
  solicitar<void>('POST', 'borrar-seccion', { token, cuerpo: { seccion_id }, ...ESCUELA });

export const guardarClase = (token: string, cuerpo: DatosClase) =>
  solicitar<{ id: number }>('POST', 'guardar-clase', { token, cuerpo, ...ESCUELA });

export const borrarClase = (token: string, clase_id: number) =>
  solicitar<void>('POST', 'borrar-clase', { token, cuerpo: { clase_id }, ...ESCUELA });

export const mover = (token: string, cuerpo: Movimiento) =>
  solicitar<{ movido: boolean }>('POST', 'mover', { token, cuerpo, ...ESCUELA });
