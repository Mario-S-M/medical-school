import { errorMessage } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useCategories from '../../catalog/hooks/use-categories';
import useCourseEdit from '../hooks/use-course-edit';
import CourseDataForm from './CourseDataForm';
import CoverUpload from './CoverUpload';
import SendToReviewButton from './SendToReviewButton';
import StatusBanner from './StatusBanner';
import SyllabusEditor from './SyllabusEditor';

export default function CourseEditor({ id }: { id: number }) {
  const { data: course, error } = useCourseEdit(id);
  const { data: categories } = useCategories();
  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorAlert message={errorMessage(error)} />
        <a className="text-sm text-sky-700 underline" href="/instructor">Volver a mis cursos</a>
      </div>
    );
  }
  if (!course || !categories) return <p role="status" className="text-slate-500">Cargando…</p>;
  return (
    <section className="flex flex-col gap-5">
      <a className="text-sm text-sky-700 underline" href="/instructor">← Mis cursos</a>
      <h1 className="text-2xl font-bold">{course.titulo}</h1>
      <StatusBanner state={course.estado} comment={course.comentario_revision} />
      {!course.es_dueno && <p className="text-sm text-slate-600">Eres parte del equipo de apoyo: los datos del curso solo los cambia su instructor.</p>}
      {course.es_dueno && course.estado !== 'en_revision' && <CoverUpload courseId={course.id} path={course.portada_ruta} />}
      <CourseDataForm course={course} categories={categories} />
      <SyllabusEditor course={course} />
      {course.es_dueno && course.estado === 'borrador' && <SendToReviewButton courseId={course.id} />}
    </section>
  );
}
