import { mensajeDeError } from '../../api/errores';
import useCursosEnRevision from '../../hooks/useCursosEnRevision';
import AlertaError from '../ui/AlertaError';
import TarjetaRevision from './TarjetaRevision';

export default function ListaRevision() {
  const { cursos, error, recargar } = useCursosEnRevision();
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Cursos en revisión</h1>
      <p className="text-slate-600">Del que lleva más tiempo esperando al más reciente.</p>
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      {cursos?.length === 0 && <p className="text-slate-500">No hay cursos esperando revisión.</p>}
      <ul className="flex flex-col gap-4">
        {cursos?.map((c) => <TarjetaRevision key={c.id} curso={c} alResolver={() => void recargar()} />)}
      </ul>
    </section>
  );
}
