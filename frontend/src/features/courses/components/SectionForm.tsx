import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import { useSaveSection } from '../hooks/use-syllabus-mutations';
import { validateSyllabusTitle } from '../schemas/syllabus-fields-schema';
import type { Section } from '../schemas/syllabus-schema';

type Props = { courseId: number; section?: Section; onSaved?: () => void };

export default function SectionForm({ courseId, section, onSaved }: Props) {
  const title = useField(validateSyllabusTitle, section?.titulo ?? '');
  const { mutate, isPending, error } = useSaveSection();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.validateAndMark()) return;
    mutate({ curso_id: courseId, seccion_id: section?.id, titulo: title.value.trim() }, {
      onSuccess: () => (section ? null : title.setValue(''), onSaved?.()),
    });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id={`seccion_titulo_${section?.id ?? 'nueva'}`} label="Título de la sección" value={title.value} onValueChange={title.onChange} onBlur={title.onBlur} errors={[...title.errors, ...fieldDetails(error, 'titulo')]} />
      <div className="self-center pt-3"><SubmitButton text={section ? 'Guardar sección' : 'Añadir sección'} submitting={isPending} /></div>
    </form>
  );
}
