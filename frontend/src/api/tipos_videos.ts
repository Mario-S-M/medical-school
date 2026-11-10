export type EstadoVideo = 'esperando_archivo' | 'en_cola' | 'procesando' | 'listo' | 'error';

export type VideoVigente = { id: number; estado: EstadoVideo; duracion_segundos: number | null; listo_en: string | null };
export type VideoNuevo = { id: number; estado: EstadoVideo; error: string | null };
export type EstadoVideoClase = { vigente: VideoVigente | null; nuevo: VideoNuevo | null };

export type DatosSubidaVideo = { clase_id: number; nombre_archivo: string; tipo_contenido: string; tamano_bytes: number };
export type FirmaVideo = { video_id: number; url_subida: string; ruta: string };
