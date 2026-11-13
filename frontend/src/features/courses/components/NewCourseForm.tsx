import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import { useCreateCourse } from '../hooks/use-course-mutations';
import { validateTitle } from '../schemas/course-fields-schema';

export default function NewCourseForm() {
  const title = useField(validateTitle);
  const { mutate, isPending, error } = useCreateCourse();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (title.validateAndMark()) mutate(title.value.trim());
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-wrap items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="titulo_nuevo" label="Título del curso nuevo" value={title.value} onValueChange={title.onChange} onBlur={title.onBlur} errors={[...title.errors, ...fieldDetails(error, 'titulo')]} />
      <div className="self-center pt-3"><SubmitButton text="Crear curso" submitting={isPending} /></div>
    </form>
  );
}
