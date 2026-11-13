import { withQueryClient } from '../../../shared/lib/with-query-client';
import useCatalog from '../hooks/use-catalog';
import CourseCard from './CourseCard';

const QUERY = {};

function RecentCourses() {
  const { data: catalog } = useCatalog(QUERY);
  if (!catalog?.cursos.length) return null;
  return (
    <section aria-labelledby="recientes" className="mt-10 flex flex-col gap-4">
      <h2 id="recientes" className="text-xl font-bold">Cursos recientes</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.cursos.slice(0, 6).map((c) => <CourseCard key={c.slug} course={c} />)}
      </ul>
      <a className="text-sm text-sky-700 underline" href="/cursos">Ver todos los cursos</a>
    </section>
  );
}

export default withQueryClient(RecentCourses);
