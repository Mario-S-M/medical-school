import useCatalogo from '../../hooks/useCatalogo';
import TarjetaCurso from './TarjetaCurso';

const CONSULTA = {};

export default function CursosRecientes() {
  const { catalogo } = useCatalogo(CONSULTA);
  if (!catalogo?.cursos.length) return null;
  return (
    <section aria-labelledby="recientes" className="mt-10 flex flex-col gap-4">
      <h2 id="recientes" className="text-xl font-bold">Cursos recientes</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo.cursos.slice(0, 6).map((c) => <TarjetaCurso key={c.slug} curso={c} />)}
      </ul>
      <a className="text-sm text-sky-700 underline" href="/cursos">Ver todos los cursos</a>
    </section>
  );
}
