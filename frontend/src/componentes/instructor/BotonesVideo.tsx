import { conSesion } from '../../api/con_sesion';
import { mensajeDeError } from '../../api/errores';
import type { EstadoVideoClase } from '../../api/tipos_videos';
import { borrarVideo, reintentarVideo } from '../../api/videos';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';
import BotonBorrar from './BotonBorrar';

type Props = { claseId: number; titulo: string; estado: EstadoVideoClase; alCambiar: () => void };

export default function BotonesVideo({ claseId, titulo, estado, alCambiar }: Props) {
  const reintento = useEnvio(() => conSesion((t) => reintentarVideo(t, estado.nuevo!.id)), alCambiar);
  const hayVideo = !!estado.vigente || !!estado.nuevo;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <AlertaError mensaje={reintento.error ? mensajeDeError(reintento.error) : null} />
      {estado.nuevo?.estado === 'error' && (
        <Boton variante="secundario" aria-label={`Reintentar video de ${titulo}`} disabled={reintento.enviando} onClick={() => void reintento.enviar()}>Reintentar</Boton>
      )}
      {hayVideo && <BotonBorrar texto="Borrar video" nombre={titulo} accion={() => conSesion((t) => borrarVideo(t, claseId))} alBorrar={alCambiar} />}
    </span>
  );
}
