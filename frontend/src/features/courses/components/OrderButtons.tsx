import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { useMoveItem } from '../hooks/use-syllabus-mutations';
import type { Movement } from '../schemas/syllabus-schema';

type Props = { type: Movement['tipo']; id: number; name: string; first: boolean; last: boolean };

export default function OrderButtons({ type, id, name, first, last }: Props) {
  const { mutate, isPending, error } = useMoveItem();
  const move = (direccion: Movement['direccion']) => () => mutate({ tipo: type, id, direccion });
  return (
    <span className="flex gap-1">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <Button variant="secondary" aria-label={`Subir ${name}`} disabled={first || isPending} onClick={move('subir')}>↑</Button>
      <Button variant="secondary" aria-label={`Bajar ${name}`} disabled={last || isPending} onClick={move('bajar')}>↓</Button>
    </span>
  );
}
