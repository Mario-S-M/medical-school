import useSubirVideo from '../../hooks/useSubirVideo';
import { MAXIMO_MIN, RECOMENDADO_MIN, AVISO_DESDE_MIN } from '../../validacion/video';
import AlertaError from '../ui/AlertaError';
import AvisoClaseLarga from './AvisoClaseLarga';
import BarraProgreso from './BarraProgreso';

type Props = { claseId: number; titulo: string; reemplaza: boolean; alTerminar: () => void };

export default function SubirVideo({ claseId, titulo, reemplaza, alTerminar }: Props) {
  const s = useSubirVideo(claseId, alTerminar);
  const ocupado = s.fase !== 'inactivo';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`video_${claseId}`} className="text-sm font-medium">{reemplaza ? 'Reemplazar el video' : 'Subir el video'} de «{titulo}»</label>
      <p className="text-xs text-slate-500">Recomendamos clases de entre {RECOMENDADO_MIN} y {AVISO_DESDE_MIN} minutos. MP4, MOV o WebM, hasta 1 GB y {MAXIMO_MIN} minutos.</p>
      <input
        id={`video_${claseId}`}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        disabled={ocupado}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void s.elegir(archivo);
          e.target.value = '';
        }}
      />
      <AlertaError mensaje={s.error} />
      {s.fase === 'midiendo' && <p role="status" className="text-sm text-slate-500">Revisando el video…</p>}
      {s.fase === 'subiendo' && <BarraProgreso porcentaje={s.progreso} />}
      {s.fase === 'aviso' && s.pendiente && <AvisoClaseLarga minutos={s.pendiente.minutos} alConfirmar={() => void s.confirmarAviso()} alCancelar={s.cancelarAviso} />}
    </div>
  );
}
