import type { EstadoVideoClase } from '../../api/tipos_videos';

type Props = Pick<EstadoVideoClase, 'vigente' | 'nuevo'>;

const minutos = (s: number | null) => (s ? ` (${Math.max(1, Math.round(s / 60))} min)` : '');
const TEXTOS = { esperando_archivo: 'Esperando el archivo…', en_cola: 'En cola para procesarse…', procesando: 'Procesando el video…' } as const;

export default function EstadoVideo({ vigente, nuevo }: Props) {
  const enProceso = nuevo && nuevo.estado !== 'error' && nuevo.estado !== 'listo' ? TEXTOS[nuevo.estado] : null;
  return (
    <div className="flex flex-col gap-1 text-sm" role="status" aria-live="polite">
      {vigente ? <span className="font-medium text-emerald-800">Video listo{minutos(vigente.duracion_segundos)}</span> : !enProceso && nuevo?.estado !== 'error' && <span className="text-slate-500">Sin video</span>}
      {enProceso && <span className="text-amber-800">{enProceso}{vigente ? ' (el video anterior sigue disponible)' : ''}</span>}
      {nuevo?.estado === 'error' && <span className="text-red-700">Error: {nuevo.error ?? 'el video no se pudo procesar.'}</span>}
    </div>
  );
}
