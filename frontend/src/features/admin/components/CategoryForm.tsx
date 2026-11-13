import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import type { Category } from '../../catalog/schemas/catalog-schema';
import { useSaveCategory } from '../hooks/use-admin-mutations';
import { validateCategoryName, validatePosition } from '../schemas/category-schema';

type Props = { initial?: Category; suggestedPosition: number; onSaved?: () => void };

export default function CategoryForm({ initial, suggestedPosition, onSaved }: Props) {
  const suffix = initial?.id ?? 'nueva';
  const name = useField(validateCategoryName, initial?.nombre ?? '');
  const position = useField(validatePosition, String(initial?.posicion ?? suggestedPosition));
  const { mutate, isPending, error } = useSaveCategory();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (![name.validateAndMark(), position.validateAndMark()].every(Boolean)) return;
    mutate({ id: initial?.id, nombre: name.value.trim(), posicion: Number(position.value) }, {
      onSuccess: () => (initial ? null : name.setValue(''), onSaved?.()),
    });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id={`nombre_${suffix}`} label="Nombre" value={name.value} onValueChange={name.onChange} onBlur={name.onBlur} errors={[...name.errors, ...fieldDetails(error, 'nombre')]} />
      <TextField id={`posicion_${suffix}`} label="Posición" type="number" value={position.value} onValueChange={position.onChange} onBlur={position.onBlur} errors={[...position.errors, ...fieldDetails(error, 'posicion')]} />
      <div className="self-center pt-3"><SubmitButton text={initial ? 'Guardar' : 'Añadir'} submitting={isPending} /></div>
    </form>
  );
}
