import type { EstadoVideo } from './tipos_videos';

export type Clase = {
  id: number;
  titulo: string;
  descripcion: string | null;
  duracion_estimada_minutos: number | null;
  es_muestra: boolean;
  posicion: number;
  video: { estado: EstadoVideo; duracion_segundos: number | null } | null;
  video_nuevo: { id: number; estado: EstadoVideo; error: string | null } | null;
};
export type Seccion = { id: number; titulo: string; posicion: number; clases: Clase[] };
