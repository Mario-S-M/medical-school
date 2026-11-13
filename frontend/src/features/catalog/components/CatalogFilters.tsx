import Button from '../../../shared/components/ui/Button';
import useCategories from '../hooks/use-categories';
import type { CatalogQuery } from '../schemas/catalog-schema';

const LEVELS = [['basico', 'Básico'], ['intermedio', 'Intermedio'], ['avanzado', 'Avanzado']];
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-sky-600/40';

// Formulario GET nativo: al enviarlo la página se recarga con los filtros en la URL.
export default function CatalogFilters({ query }: { query: CatalogQuery }) {
  const { data: categories } = useCategories();
  return (
    <form action="/cursos" method="get" role="search" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_q" className="text-sm font-medium">Buscar</label>
        <input id="filtro_q" name="q" type="search" defaultValue={query.q ?? ''} className={field} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_categoria" className="text-sm font-medium">Categoría</label>
        <select id="filtro_categoria" name="categoria" key={categories?.length} defaultValue={query.categoria ?? ''} className={field}>
          <option value="">Todas</option>
          {categories?.map((c) => <option key={c.id} value={c.slug}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_nivel" className="text-sm font-medium">Nivel</label>
        <select id="filtro_nivel" name="nivel" defaultValue={query.nivel ?? ''} className={field}>
          <option value="">Todos</option>
          {LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <Button type="submit">Filtrar</Button>
    </form>
  );
}
