import { useMutation } from '@tanstack/react-query';
import { errorMessage } from '../api/error-messages';
import ErrorAlert from './ui/ErrorAlert';
import Button from './ui/Button';

type Props = { name: string; action: () => Promise<unknown>; text?: string };

// Botón con confirmación para borrar, quitar o cancelar algo; la acción ya invalida el caché que corresponda.
export default function DeleteButton({ name, action, text = 'Borrar' }: Props) {
  const { mutate, isPending, error } = useMutation({ mutationFn: action });
  const confirm = () => {
    if (window.confirm(`¿${text} «${name}»? No se puede deshacer.`)) mutate();
  };
  return (
    <>
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <Button variant="secondary" aria-label={`${text} ${name}`} disabled={isPending} onClick={confirm}>{text}</Button>
    </>
  );
}
