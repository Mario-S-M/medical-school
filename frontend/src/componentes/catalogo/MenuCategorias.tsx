import useCategorias from '../../hooks/useCategorias';

export default function MenuCategorias() {
  const { lista } = useCategorias();
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Categorías</summary>
      <ul className="absolute left-0 z-20 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        <li><a className="block rounded px-3 py-1.5 text-sm hover:bg-slate-100" href="/cursos">Todos los cursos</a></li>
        {lista?.map((c) => (
          <li key={c.id}><a className="block rounded px-3 py-1.5 text-sm hover:bg-slate-100" href={`/cursos?categoria=${c.slug}`}>{c.nombre}</a></li>
        ))}
      </ul>
    </details>
  );
}
