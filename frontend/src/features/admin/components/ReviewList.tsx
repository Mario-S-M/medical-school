import { errorMessage } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useReviewCourses from '../hooks/use-review-courses';
import ReviewCard from './ReviewCard';

export default function ReviewList() {
  const { data: courses, error } = useReviewCourses();
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Cursos en revisión</h1>
      <p className="text-slate-600">Del que lleva más tiempo esperando al más reciente.</p>
      <ErrorAlert message={error ? errorMessage(error) : null} />
      {courses?.length === 0 && <p className="text-slate-500">No hay cursos esperando revisión.</p>}
      <ul className="flex flex-col gap-4">
        {courses?.map((c) => <ReviewCard key={c.id} course={c} />)}
      </ul>
    </section>
  );
}
