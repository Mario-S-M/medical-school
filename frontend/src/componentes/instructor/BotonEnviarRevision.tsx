import { conSesion } from '../../api/con_sesion';
import { ErrorApi, mensajeDeError } from '../../api/errores';
import { enviarRevision } from '../../api/revision';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';

type Props = { cursoId: number; alEnviar: () => void };

export default function BotonEnviarRevision({ cursoId, alEnviar }: Props) {
  const { enviar, enviando, error } = useEnvio(() => conSesion((token) => enviarRevision(token, cursoId)), alEnviar);
  const faltas = error instanceof ErrorApi && error.codigo === 'CURSO_INCOMPLETO' ? error.detalles : [];
  return (
    <section aria-label="Enviar a revisión" className="flex max-w-2xl flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <p className="text-sm text-slate-700">Cuando el curso esté completo, envíalo a revisión. Un administrador lo aprobará o te dirá qué cambiar.</p>
      <AlertaError mensaje={error && faltas.length === 0 ? mensajeDeError(error) : null} />
      {faltas.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Antes de enviarlo a revisión:</p>
          <ul className="list-disc pl-5">{faltas.map((d) => <li key={d.regla}>{d.mensaje}</li>)}</ul>
        </div>
      )}
      <div><Boton disabled={enviando} onClick={() => void enviar()}>Enviar a revisión</Boton></div>
    </section>
  );
}
