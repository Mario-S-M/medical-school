import type { Consulta } from '../../api/tipos_catalogo';
import useCatalogo from '../../hooks/useCatalogo';
import { parametro } from '../../sesion/parametros';
import AlertaError from '../ui/AlertaError';
import FiltrosCatalogo from './FiltrosCatalogo';
import Paginacion from './Paginacion';
import TarjetaCurso from './TarjetaCurso';

const leer = (): Consulta => ({
  q: parametro('q') ?? undefined,
  categoria: parametro('categoria') ?? undefined,
  nivel: parametro('nivel') ?? undefined,
  pagina: Number(parametro('pagina')) || undefined,
});

export default function ListaCursos() {
  const consulta = leer();
  const { catalogo, error } = useCatalogo(consulta);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cursos</h1>
      <FiltrosCatalogo consulta={consulta} />
      <AlertaError mensaje={error ? 'No pudimos cargar los cursos. Inténtalo de nuevo.' : null} />
      {!catalogo && !error && <p role="status" className="text-slate-500">Cargando…</p>}
      {catalogo && <p role="status" className="text-sm text-slate-600">{catalogo.total} {catalogo.total === 1 ? 'curso' : 'cursos'}</p>}
      {catalogo?.cursos.length === 0 && <p className="text-slate-500">No encontramos cursos con esos filtros.</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo?.cursos.map((c) => <TarjetaCurso key={c.slug} curso={c} />)}
      </ul>
      {catalogo && <Paginacion pagina={catalogo.pagina} paginas={catalogo.paginas} />}
    </section>
  );
}
