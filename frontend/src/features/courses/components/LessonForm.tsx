import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import CheckboxField from '../../../shared/components/ui/CheckboxField';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextareaField from '../../../shared/components/ui/TextareaField';
import TextField from '../../../shared/components/ui/TextField';
import { useSaveLesson } from '../hooks/use-syllabus-mutations';
import useLessonForm from '../hooks/use-lesson-form';
import type { Lesson } from '../schemas/syllabus-schema';

type Props = { sectionId: number; lesson?: Lesson; onSaved?: () => void };

export default function LessonForm({ sectionId, lesson, onSaved }: Props) {
  const f = useLessonForm(sectionId, lesson);
  const suffix = lesson?.id ?? `nueva_${sectionId}`;
  const { mutate, isPending, error } = useSaveLesson();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (f.validate()) mutate(f.body(), { onSuccess: () => (lesson ? null : f.clear(), onSaved?.()) });
  };
  const errs = (c: typeof f.title, k: string) => [...c.errors, ...fieldDetails(error, k)];
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id={`clase_titulo_${suffix}`} label="Título de la clase" value={f.title.value} onValueChange={f.title.onChange} onBlur={f.title.onBlur} errors={errs(f.title, 'titulo')} />
      <TextareaField id={`clase_desc_${suffix}`} label="Descripción de la clase" rows={2} value={f.description.value} onValueChange={f.description.onChange} onBlur={f.description.onBlur} errors={errs(f.description, 'descripcion')} />
      <TextField id={`clase_min_${suffix}`} label="Duración estimada (minutos)" type="number" value={f.duration.value} onValueChange={f.duration.onChange} onBlur={f.duration.onBlur} errors={errs(f.duration, 'duracion_estimada_minutos')} />
      <CheckboxField id={`clase_muestra_${suffix}`} label="Clase muestra (la verá cualquier visitante)" checked={f.sample} onValueChange={f.setSample} />
      <SubmitButton text={lesson ? 'Guardar clase' : 'Añadir clase'} submitting={isPending} />
    </form>
  );
}
