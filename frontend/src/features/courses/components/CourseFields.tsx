import SelectField from '../../../shared/components/ui/SelectField';
import TextareaField from '../../../shared/components/ui/TextareaField';
import TextField from '../../../shared/components/ui/TextField';
import type { Category } from '../../catalog/schemas/catalog-schema';
import type useCourseForm from '../hooks/use-course-form';

type Props = {
  fields: ReturnType<typeof useCourseForm>['fields'];
  categories: Category[];
  locked: boolean;
  details: (field: string) => string[];
};

const LEVELS = [{ value: 'basico', text: 'Básico' }, { value: 'intermedio', text: 'Intermedio' }, { value: 'avanzado', text: 'Avanzado' }];

export default function CourseFields({ fields: f, categories, locked, details }: Props) {
  const common = (k: keyof typeof f) => ({ value: f[k].value, onValueChange: f[k].onChange, onBlur: f[k].onBlur, disabled: locked, errors: [...f[k].errors, ...details(k)] });
  return (
    <>
      <TextField id="titulo" label="Título" {...common('titulo')} />
      <TextField id="subtitulo" label="Subtítulo" {...common('subtitulo')} />
      <TextareaField id="descripcion" label="Descripción" rows={6} {...common('descripcion')} />
      <TextareaField id="conocimientos_previos" label="Conocimientos previos" help="Qué conviene saber antes de empezar." {...common('conocimientos_previos')} />
      <TextareaField id="lo_que_aprenderas" label="Lo que aprenderás" help="Un punto por línea, hasta 10." {...common('lo_que_aprenderas')} />
      <SelectField id="nivel" label="Nivel" options={LEVELS} {...common('nivel')} />
      <SelectField id="categoria_id" label="Categoría" options={categories.map((x) => ({ value: String(x.id), text: x.nombre }))} {...common('categoria_id')} />
    </>
  );
}
