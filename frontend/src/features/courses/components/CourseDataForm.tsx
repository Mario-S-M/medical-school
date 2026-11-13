import { useState, type FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import SuccessAlert from '../../../shared/components/ui/SuccessAlert';
import type { Category } from '../../catalog/schemas/catalog-schema';
import useCourseForm from '../hooks/use-course-form';
import { useUpdateCourse } from '../hooks/use-course-mutations';
import type { CourseEdit } from '../schemas/course-schema';
import CourseFields from './CourseFields';

type Props = { course: CourseEdit; categories: Category[] };

export default function CourseDataForm({ course, categories }: Props) {
  const { fields, validate, body } = useCourseForm(course);
  const [saved, setSaved] = useState(false);
  const locked = !course.es_dueno || course.estado === 'en_revision';
  const { mutate, isPending, error } = useUpdateCourse();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (validate()) mutate(body(), { onSuccess: () => setSaved(true) });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      {saved && <SuccessAlert message="Cambios guardados." />}
      <CourseFields fields={fields} categories={categories} locked={locked} details={(k) => fieldDetails(error, k)} />
      {!locked && <SubmitButton text="Guardar cambios" submitting={isPending} />}
    </form>
  );
}
