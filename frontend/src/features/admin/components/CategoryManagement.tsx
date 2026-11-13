import useCategories from '../../catalog/hooks/use-categories';
import CategoryForm from './CategoryForm';
import CategoryRow from './CategoryRow';

export default function CategoryManagement() {
  const { data: categories, error } = useCategories();
  const last = categories?.at(-1)?.posicion ?? 0;
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Categorías</h1>
      <p className="text-slate-600">Aparecen en el menú de la cabecera y como filtro del catálogo, ordenadas por su posición.</p>
      <CategoryForm key={categories?.length ?? 0} suggestedPosition={last + 10} />
      {error ? <p role="alert" className="text-red-700">No pudimos cargar las categorías.</p> : null}
      {categories && categories.length === 0 && <p className="text-slate-500">Todavía no hay categorías.</p>}
      <ul className="flex flex-col gap-2">
        {categories?.map((c) => <CategoryRow key={`${c.id}-${c.nombre}-${c.posicion}`} category={c} />)}
      </ul>
    </section>
  );
}
