import useCategorias from '../../hooks/useCategorias';
import type { Consulta } from '../../api/tipos_catalogo';
import Boton from '../ui/Boton';

const NIVELES = [['basico', 'Básico'], ['intermedio', 'Intermedio'], ['avanzado', 'Avanzado']];
const campo = 'rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-sky-600/40';

// Formulario GET nativo: al enviarlo la página se recarga con los filtros en la URL.
export default function FiltrosCatalogo({ consulta }: { consulta: Consulta }) {
  const { lista } = useCategorias();
  return (
    <form action="/cursos" method="get" role="search" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_q" className="text-sm font-medium">Buscar</label>
        <input id="filtro_q" name="q" type="search" defaultValue={consulta.q ?? ''} className={campo} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_categoria" className="text-sm font-medium">Categoría</label>
        <select id="filtro_categoria" name="categoria" key={lista?.length} defaultValue={consulta.categoria ?? ''} className={campo}>
          <option value="">Todas</option>
          {lista?.map((c) => <option key={c.id} value={c.slug}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="filtro_nivel" className="text-sm font-medium">Nivel</label>
        <select id="filtro_nivel" name="nivel" defaultValue={consulta.nivel ?? ''} className={campo}>
          <option value="">Todos</option>
          {NIVELES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <Boton type="submit">Filtrar</Boton>
    </form>
  );
}
