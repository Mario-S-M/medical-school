import useField from '../../../shared/hooks/use-field';
import type { CourseData, CourseEdit } from '../schemas/course-schema';
import { lines, validateDescription, validateLearn, validatePrerequisites, validateSubtitle, validateTitle } from '../schemas/course-fields-schema';

// Estado de los campos del formulario de datos del curso y el cuerpo que se envía a la API.
export default function useCourseForm(c: CourseEdit) {
  const fields = {
    titulo: useField(validateTitle, c.titulo),
    subtitulo: useField(validateSubtitle, c.subtitulo ?? ''),
    descripcion: useField(validateDescription, c.descripcion ?? ''),
    conocimientos_previos: useField(validatePrerequisites, c.conocimientos_previos ?? ''),
    lo_que_aprenderas: useField(validateLearn, c.lo_que_aprenderas.join('\n')),
    nivel: useField(() => [], c.nivel ?? ''),
    categoria_id: useField(() => [], c.categoria_id ? String(c.categoria_id) : ''),
  };
  const validate = () => Object.values(fields).map((x) => x.validateAndMark()).every(Boolean);
  const body = (): CourseData => ({
    curso_id: c.id,
    titulo: fields.titulo.value.trim(),
    subtitulo: fields.subtitulo.value.trim(),
    descripcion: fields.descripcion.value.trim(),
    conocimientos_previos: fields.conocimientos_previos.value.trim(),
    lo_que_aprenderas: lines(fields.lo_que_aprenderas.value),
    nivel: (fields.nivel.value || null) as CourseData['nivel'],
    categoria_id: fields.categoria_id.value ? Number(fields.categoria_id.value) : null,
  });
  return { fields, validate, body };
}
