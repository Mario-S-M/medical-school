type Props = { pagina: number; paginas: number };

function enlace(pagina: number) {
  const params = new URLSearchParams(window.location.search);
  params.set('pagina', String(pagina));
  return `/cursos?${params}`;
}

export default function Paginacion({ pagina, paginas }: Props) {
  if (paginas <= 1) return null;
  const estilo = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100';
  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-3">
      {pagina > 1 && <a className={estilo} href={enlace(pagina - 1)}>Anterior</a>}
      <span className="text-sm text-slate-600">Página {pagina} de {paginas}</span>
      {pagina < paginas && <a className={estilo} href={enlace(pagina + 1)}>Siguiente</a>}
    </nav>
  );
}
