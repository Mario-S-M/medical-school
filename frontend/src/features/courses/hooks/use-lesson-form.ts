import { useState } from 'react';
import useField from '../../../shared/hooks/use-field';
import type { Lesson, LessonData } from '../schemas/syllabus-schema';
import { validateDuration, validateLessonDescription, validateSyllabusTitle } from '../schemas/syllabus-fields-schema';

// Campos del formulario de una clase y el cuerpo que se envía a la API.
export default function useLessonForm(sectionId: number, lesson?: Lesson) {
  const title = useField(validateSyllabusTitle, lesson?.titulo ?? '');
  const description = useField(validateLessonDescription, lesson?.descripcion ?? '');
  const duration = useField(validateDuration, lesson?.duracion_estimada_minutos?.toString() ?? '');
  const [sample, setSample] = useState(lesson?.es_muestra ?? false);
  const validate = () => [title, description, duration].map((c) => c.validateAndMark()).every(Boolean);
  const body = (): LessonData => ({
    seccion_id: sectionId,
    clase_id: lesson?.id,
    titulo: title.value.trim(),
    descripcion: description.value.trim() || null,
    duracion_estimada_minutos: duration.value.trim() ? Number(duration.value) : null,
    es_muestra: sample,
  });
  const clear = () => [title, description, duration].forEach((c) => c.setValue(''));
  return { title, description, duration, sample, setSample, validate, body, clear };
}
