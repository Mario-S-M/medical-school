export const TIPOS_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
export const RECOMENDADO_MIN = 2;
export const AVISO_DESDE_MIN = 9;
export const MAXIMO_MIN = 30;
export const MAXIMO_BYTES = 1024 * 1024 * 1024;

export type Veredicto =
  | { tipo: 'rechazado'; motivo: string }
  | { tipo: 'larga' | 'normal'; minutos: number | null };

const gigas = (bytes: number) => (bytes / MAXIMO_BYTES).toFixed(1);

// Clasifica un archivo antes de subirlo. `minutos` es null si el navegador no pudo leer la duración (el servidor la comprueba).
export function clasificarVideo(archivo: { type: string; size: number }, minutos: number | null): Veredicto {
  if (!TIPOS_VIDEO.includes(archivo.type)) return { tipo: 'rechazado', motivo: 'El video debe ser MP4, MOV o WebM.' };
  if (archivo.size > MAXIMO_BYTES) return { tipo: 'rechazado', motivo: `El video pesa ${gigas(archivo.size)} GB y el máximo es 1 GB.` };
  if (minutos !== null && minutos > MAXIMO_MIN) return { tipo: 'rechazado', motivo: `El video dura ${Math.round(minutos)} minutos y el máximo es ${MAXIMO_MIN}.` };
  return { tipo: minutos !== null && minutos > AVISO_DESDE_MIN ? 'larga' : 'normal', minutos };
}
