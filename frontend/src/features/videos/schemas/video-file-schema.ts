import { z } from 'zod';

export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const RECOMMENDED_MIN = 2;
export const WARN_FROM_MIN = 9;
export const MAX_MIN = 30;
export const MAX_BYTES = 1024 * 1024 * 1024;

const gigabytes = (bytes: number) => (bytes / MAX_BYTES).toFixed(1);

// Archivo y duración (en minutos; null si el navegador no pudo leerla, entonces la comprueba el servidor).
export const videoFileSchema = z
  .object({ type: z.string(), size: z.number(), minutes: z.number().nullable() })
  .superRefine((video, ctx) => {
    const reject = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!VIDEO_TYPES.includes(video.type)) reject('El video debe ser MP4, MOV o WebM.');
    else if (video.size > MAX_BYTES) reject(`El video pesa ${gigabytes(video.size)} GB y el máximo es 1 GB.`);
    else if (video.minutes !== null && video.minutes > MAX_MIN) reject(`El video dura ${Math.round(video.minutes)} minutos y el máximo es ${MAX_MIN}.`);
  });

export type VideoVerdict =
  | { kind: 'rejected'; reason: string }
  | { kind: 'normal' | 'short' | 'long'; minutes: number | null };

// Clasifica un archivo antes de subirlo: normal, corta (menos de lo recomendado), larga (pide confirmar) o rechazada.
export function classifyVideo(file: { type: string; size: number }, minutes: number | null): VideoVerdict {
  const check = videoFileSchema.safeParse({ type: file.type, size: file.size, minutes });
  if (!check.success) return { kind: 'rejected', reason: check.error.issues[0].message };
  if (minutes !== null && minutes > WARN_FROM_MIN) return { kind: 'long', minutes };
  return { kind: minutes !== null && minutes < RECOMMENDED_MIN ? 'short' : 'normal', minutes };
}
