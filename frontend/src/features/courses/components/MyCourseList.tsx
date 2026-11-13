import { errorMessage } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useRoles from '../../auth/hooks/use-roles';
import useMyCourses from '../hooks/use-my-courses';
import MyCourseCard from './MyCourseCard';
import NewCourseForm from './NewCourseForm';

export default function MyCourseList() {
  const { data: courses, error } = useMyCourses();
  const { roles } = useRoles();
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Mis cursos</h1>
      {roles.includes('instructor') && <a className="text-sm text-sky-700 underline" href="/instructor/equipo">Mi equipo de apoyo</a>}
      {roles.includes('instructor') && <NewCourseForm />}
      <ErrorAlert message={error ? errorMessage(error) : null} />
      {courses?.length === 0 && <p className="text-slate-500">Todavía no tienes cursos.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {courses?.map((c) => <MyCourseCard key={c.id} course={c} />)}
      </ul>
    </section>
  );
}
