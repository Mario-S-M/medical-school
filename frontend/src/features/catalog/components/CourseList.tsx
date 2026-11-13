import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { getParam } from '../../../shared/lib/url-params';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import useCatalog from '../hooks/use-catalog';
import type { CatalogQuery } from '../schemas/catalog-schema';
import CatalogFilters from './CatalogFilters';
import CourseCard from './CourseCard';
import Pagination from './Pagination';

const readQuery = (): CatalogQuery => ({
  q: getParam('q') ?? undefined,
  categoria: getParam('categoria') ?? undefined,
  nivel: getParam('nivel') ?? undefined,
  pagina: Number(getParam('pagina')) || undefined,
});

function CourseList() {
  const query = readQuery();
  const { data: catalog, error } = useCatalog(query);
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Cursos</h1>
      <CatalogFilters query={query} />
      <ErrorAlert message={error ? 'No pudimos cargar los cursos. Inténtalo de nuevo.' : null} />
      {!catalog && !error && <p role="status" className="text-slate-500">Cargando…</p>}
      {catalog && <p role="status" className="text-sm text-slate-600">{catalog.total} {catalog.total === 1 ? 'curso' : 'cursos'}</p>}
      {catalog?.cursos.length === 0 && <p className="text-slate-500">No encontramos cursos con esos filtros.</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog?.cursos.map((c) => <CourseCard key={c.slug} course={c} />)}
      </ul>
      {catalog && <Pagination page={catalog.pagina} pages={catalog.paginas} />}
    </section>
  );
}

export default withQueryClient(CourseList);
