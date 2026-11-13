import { errorMessage } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { getParam } from '../../../shared/lib/url-params';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import RetireCourse from '../../admin/components/RetireCourse';
import useRoles from '../../auth/hooks/use-roles';
import { coverUrl } from '../../courses/lib/cover-url';
import useCourseSheet from '../hooks/use-course-sheet';
import { LEVEL_LABELS } from '../lib/level-labels';
import PublicSyllabus from './PublicSyllabus';

function CourseSheet() {
  const { data: course, error } = useCourseSheet(getParam('c') ?? '');
  const { roles } = useRoles();
  if (error) return <ErrorAlert message={`${errorMessage(error)} El curso no existe o ya no está disponible.`} />;
  if (!course) return <p role="status" className="text-slate-500">Cargando…</p>;
  const cover = coverUrl(course.portada_ruta);
  return (
    <article className="flex max-w-3xl flex-col gap-5">
      {cover && <img src={cover} alt={`Portada de ${course.titulo}`} className="h-64 w-full rounded-2xl object-cover" />}
      <h1 className="text-3xl font-bold">{course.titulo}</h1>
      {course.subtitulo && <p className="text-lg text-slate-700">{course.subtitulo}</p>}
      <p className="text-sm text-slate-600">{course.instructor}{course.categoria ? ` · ${course.categoria.nombre}` : ''}{course.nivel ? ` · ${LEVEL_LABELS[course.nivel]}` : ''}</p>
      {course.descripcion && <p className="whitespace-pre-line">{course.descripcion}</p>}
      {course.lo_que_aprenderas.length > 0 && (
        <section aria-labelledby="aprenderas"><h2 id="aprenderas" className="text-xl font-bold">Lo que aprenderás</h2>
          <ul className="mt-2 list-disc pl-5">{course.lo_que_aprenderas.map((p) => <li key={p}>{p}</li>)}</ul></section>
      )}
      {course.conocimientos_previos && <section aria-labelledby="previos"><h2 id="previos" className="text-xl font-bold">Conocimientos previos</h2><p className="mt-2 whitespace-pre-line">{course.conocimientos_previos}</p></section>}
      <section aria-labelledby="temario"><h2 id="temario" className="mb-2 text-xl font-bold">Temario</h2><PublicSyllabus sections={course.secciones} /></section>
      {roles.includes('administrador') && <RetireCourse courseId={course.id} />}
    </article>
  );
}

export default withQueryClient(CourseSheet);
