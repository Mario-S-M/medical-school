import { conSesion } from '../../api/con_sesion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import { resolverRevision } from '../../api/revision';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';
import CampoAreaTexto from '../ui/CampoAreaTexto';

type Props = { cursoId: number; alResolver: () => void };

const pedirComentario = (v: string) => (v.trim() ? [] : ['Explica al instructor qué debe cambiar.']);

export default function AccionesRevision({ cursoId, alResolver }: Props) {
  const comentario = useCampo(pedirComentario);
  const aprobar = useEnvio(() => conSesion((t) => resolverRevision(t, { curso_id: cursoId, aprobar: true })), alResolver);
  const devolver = useEnvio(
    () => conSesion((t) => resolverRevision(t, { curso_id: cursoId, aprobar: false, comentario: comentario.valor.trim() })),
    alResolver,
  );
  const error = aprobar.error ?? devolver.error;
  const alDevolver = () => {
    if (comentario.validarYMarcar()) void devolver.enviar();
  };
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoAreaTexto id={`comentario_${cursoId}`} etiqueta="Comentario para el instructor (obligatorio al devolver)" rows={3} value={comentario.valor} alCambiar={comentario.alCambiar} onBlur={comentario.alSalir} errores={[...comentario.errores, ...detallesDeCampo(devolver.error, 'comentario')]} />
      <div className="flex flex-wrap gap-2">
        <Boton disabled={aprobar.enviando} onClick={() => void aprobar.enviar()}>Aprobar y publicar</Boton>
        <Boton variante="secundario" disabled={devolver.enviando} onClick={alDevolver}>Devolver con comentario</Boton>
      </div>
    </div>
  );
}
