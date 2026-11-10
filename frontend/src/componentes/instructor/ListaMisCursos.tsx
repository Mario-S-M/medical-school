import { mensajeDeError } from '../../api/errores';
import useMisCursos from '../../hooks/useMisCursos';
import AlertaError from '../ui/AlertaError';
import FormularioNuevoCurso from './FormularioNuevoCurso';
import TarjetaMiCurso from './TarjetaMiCurso';
import useRoles from '../../hooks/useRoles';

export default function ListaMisCursos() {
  const { cursos, error } = useMisCursos();
  const { roles } = useRoles();
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Mis cursos</h1>
      {roles.includes('instructor') && <a className="text-sm text-sky-700 underline" href="/instructor/equipo">Mi equipo de apoyo</a>}
      {roles.includes('instructor') && <FormularioNuevoCurso />}
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      {cursos?.length === 0 && <p className="text-slate-500">Todavía no tienes cursos.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {cursos?.map((c) => <TarjetaMiCurso key={c.id} curso={c} />)}
      </ul>
    </section>
  );
}
