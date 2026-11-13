import type { VideoStatus as Status } from '../schemas/video-status-schema';

const minutes = (s?: number | null) => (s ? ` (${Math.max(1, Math.round(s / 60))} min)` : '');
const TEXTS = { esperando_archivo: 'Esperando el archivo…', en_cola: 'En cola para procesarse…', procesando: 'Procesando el video…' } as const;

export default function VideoStatus({ vigente, nuevo }: Status) {
  const inProgress = nuevo && nuevo.estado !== 'error' && nuevo.estado !== 'listo' ? TEXTS[nuevo.estado] : null;
  return (
    <div className="flex flex-col gap-1 text-sm" role="status" aria-live="polite">
      {vigente ? <span className="font-medium text-emerald-800">Video listo{minutes(vigente.duracion_segundos)}</span> : !inProgress && nuevo?.estado !== 'error' && <span className="text-slate-500">Sin video</span>}
      {inProgress && <span className="text-amber-800">{inProgress}{vigente ? ' (el video anterior sigue disponible)' : ''}</span>}
      {nuevo?.estado === 'error' && <span className="text-red-700">Error: {nuevo.error ?? 'el video no se pudo procesar.'}</span>}
    </div>
  );
}
