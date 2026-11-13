type Props = { page: number; pages: number };

function link(page: number) {
  const params = new URLSearchParams(window.location.search);
  params.set('pagina', String(page));
  return `/cursos?${params}`;
}

export default function Pagination({ page, pages }: Props) {
  if (pages <= 1) return null;
  const style = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100';
  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-3">
      {page > 1 && <a className={style} href={link(page - 1)}>Anterior</a>}
      <span className="text-sm text-slate-600">Página {page} de {pages}</span>
      {page < pages && <a className={style} href={link(page + 1)}>Siguiente</a>}
    </nav>
  );
}
