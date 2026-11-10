import { conSesion } from '../../api/con_sesion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import { retirarCurso } from '../../api/revision';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { navegar } from '../../sesion/navegar';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';
import CampoAreaTexto from '../ui/CampoAreaTexto';

const pedirComentario = (v: string) => (v.trim() ? [] : ['Explica al instructor por qué se retira.']);

// Solo para administradores: saca el curso del catálogo y lo devuelve a borrador con un comentario.
export default function RetirarCurso({ cursoId }: { cursoId: number }) {
  const comentario = useCampo(pedirComentario);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((t) => retirarCurso(t, cursoId, comentario.valor.trim())),
    () => void navegar('/cursos'),
  );
  return (
    <details className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-red-800">Retirar este curso del catálogo</summary>
      <div className="mt-3 flex flex-col gap-3">
        <AlertaError mensaje={error ? mensajeDeError(error) : null} />
        <CampoAreaTexto id="comentario_retiro" etiqueta="Motivo (lo verá el instructor)" rows={3} value={comentario.valor} alCambiar={comentario.alCambiar} onBlur={comentario.alSalir} errores={[...comentario.errores, ...detallesDeCampo(error, 'comentario')]} />
        <div><Boton disabled={enviando} onClick={() => comentario.validarYMarcar() && void enviar()}>Retirar del catálogo</Boton></div>
      </div>
    </details>
  );
}
