import type { CourseSummary } from '../schemas/course-schema';
import StatusBanner from './StatusBanner';

export default function MyCourseCard({ course }: { course: CourseSummary }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <a className="text-lg font-semibold text-sky-800 underline-offset-2 hover:underline" href={`/instructor/curso?id=${course.id}`}>{course.titulo}</a>
      <p className="text-sm text-slate-500">{course.es_mio ? 'Tuyo' : `De ${course.instructor} (equipo de apoyo)`}</p>
      <StatusBanner state={course.estado} comment={course.comentario_revision} />
    </li>
  );
}
