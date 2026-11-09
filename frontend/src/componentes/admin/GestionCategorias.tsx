import useCategorias from '../../hooks/useCategorias';
import FilaCategoria from './FilaCategoria';
import FormularioCategoria from './FormularioCategoria';

export default function GestionCategorias() {
  const { lista, error, recargar } = useCategorias();
  const ultima = lista?.at(-1)?.posicion ?? 0;
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Categorías</h1>
      <p className="text-slate-600">Aparecen en el menú de la cabecera y como filtro del catálogo, ordenadas por su posición.</p>
      <FormularioCategoria key={lista?.length ?? 0} posicionSugerida={ultima + 10} alGuardar={() => void recargar()} />
      {error ? <p role="alert" className="text-red-700">No pudimos cargar las categorías.</p> : null}
      {lista && lista.length === 0 && <p className="text-slate-500">Todavía no hay categorías.</p>}
      <ul className="flex flex-col gap-2">
        {lista?.map((c) => <FilaCategoria key={`${c.id}-${c.nombre}-${c.posicion}`} categoria={c} alCambiar={() => void recargar()} />)}
      </ul>
    </section>
  );
}
