import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import TextareaField from '../../../shared/components/ui/TextareaField';
import useField from '../../../shared/hooks/use-field';
import { useRetireCourse } from '../hooks/use-admin-mutations';
import { validateRetireReason } from '../schemas/category-schema';

// Solo para administradores: saca el curso del catálogo y lo devuelve a borrador con un comentario.
export default function RetireCourse({ courseId }: { courseId: number }) {
  const reason = useField(validateRetireReason);
  const { mutate, isPending, error } = useRetireCourse();
  const retire = () => reason.validateAndMark() && mutate({ curso_id: courseId, comentario: reason.value.trim() });
  return (
    <details className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-red-800">Retirar este curso del catálogo</summary>
      <div className="mt-3 flex flex-col gap-3">
        <ErrorAlert message={error ? errorMessage(error) : null} />
        <TextareaField id="comentario_retiro" label="Motivo (lo verá el instructor)" rows={3} value={reason.value} onValueChange={reason.onChange} onBlur={reason.onBlur} errors={[...reason.errors, ...fieldDetails(error, 'comentario')]} />
        <div><Button disabled={isPending} onClick={retire}>Retirar del catálogo</Button></div>
      </div>
    </details>
  );
}
