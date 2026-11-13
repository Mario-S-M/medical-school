import PublicSyllabus from '../../catalog/components/PublicSyllabus';
import CoverImage from '../../courses/components/CoverImage';
import type { ReviewCourse } from '../schemas/review-schema';
import ReviewActions from './ReviewActions';

export default function ReviewCard({ course }: { course: ReviewCourse }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <CoverImage path={course.portada_ruta} alt={`Portada de ${course.titulo}`} className="h-40 w-full rounded-lg object-cover" />
      <h2 className="text-xl font-semibold">{course.titulo}</h2>
      <p className="text-sm text-slate-600">{course.instructor} · {course.categoria ?? 'Sin categoría'} · {course.nivel ?? 'Sin nivel'}</p>
      {course.subtitulo && <p className="font-medium">{course.subtitulo}</p>}
      {course.descripcion && <p className="whitespace-pre-line text-slate-700">{course.descripcion}</p>}
      {course.conocimientos_previos && <p className="text-sm"><strong>Conocimientos previos:</strong> {course.conocimientos_previos}</p>}
      <PublicSyllabus sections={course.secciones} link="video" />
      <ReviewActions courseId={course.id} />
    </li>
  );
}
