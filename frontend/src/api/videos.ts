import { solicitar } from './cliente';
import type { DatosSubidaVideo, EstadoVideoClase, FirmaVideo } from './tipos_videos';

const ESCUELA = { prefijo: 'escuela' };

export const solicitarSubidaVideo = (token: string, cuerpo: DatosSubidaVideo) =>
  solicitar<FirmaVideo>('POST', 'solicitar-subida-video', { token, cuerpo, ...ESCUELA });

export const confirmarSubidaVideo = (token: string, video_id: number) =>
  solicitar<{ estado: string }>('POST', 'confirmar-subida-video', { token, cuerpo: { video_id }, ...ESCUELA });

export const estadoVideo = (token: string, clase_id: number) =>
  solicitar<EstadoVideoClase>('GET', `estado-video?clase_id=${clase_id}`, { token, ...ESCUELA });

export const reintentarVideo = (token: string, video_id: number) =>
  solicitar<{ estado: string }>('POST', 'reintentar-video', { token, cuerpo: { video_id }, ...ESCUELA });

export const borrarVideo = (token: string, clase_id: number) =>
  solicitar<void>('POST', 'borrar-video', { token, cuerpo: { clase_id }, ...ESCUELA });

// El archivo va directo a Storage con la URL firmada (nunca pasa por n8n); XMLHttpRequest permite medir el progreso.
export function subirVideo(url: string, archivo: File, alProgreso: (porcentaje: number) => void) {
  return new Promise<void>((resolver, rechazar) => {
    const peticion = new XMLHttpRequest();
    peticion.open('PUT', url);
    peticion.setRequestHeader('Content-Type', archivo.type);
    peticion.upload.onprogress = (e) => e.lengthComputable && alProgreso(Math.round((e.loaded / e.total) * 100));
    peticion.onload = () => (peticion.status < 300 ? resolver() : rechazar(new Error('subida')));
    peticion.onerror = () => rechazar(new Error('subida'));
    peticion.send(archivo);
  });
}
