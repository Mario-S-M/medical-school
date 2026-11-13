import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import TextareaField from '../../../shared/components/ui/TextareaField';
import useField from '../../../shared/hooks/use-field';
import { useResolveReview } from '../hooks/use-admin-mutations';
import { validateReviewComment } from '../schemas/category-schema';

export default function ReviewActions({ courseId }: { courseId: number }) {
  const comment = useField(validateReviewComment);
  const { mutate, isPending, error, variables } = useResolveReview();
  const approve = () => mutate({ curso_id: courseId, aprobar: true });
  const sendBack = () => {
    if (comment.validateAndMark()) mutate({ curso_id: courseId, aprobar: false, comentario: comment.value.trim() });
  };
  const commentErrors = variables?.aprobar === false ? fieldDetails(error, 'comentario') : [];
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextareaField id={`comentario_${courseId}`} label="Comentario para el instructor (obligatorio al devolver)" rows={3} value={comment.value} onValueChange={comment.onChange} onBlur={comment.onBlur} errors={[...comment.errors, ...commentErrors]} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending} onClick={approve}>Aprobar y publicar</Button>
        <Button variant="secondary" disabled={isPending} onClick={sendBack}>Devolver con comentario</Button>
      </div>
    </div>
  );
}
