import { ApiError } from '../../../shared/api/api-error';
import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { useSendToReview } from '../hooks/use-course-mutations';

export default function SendToReviewButton({ courseId }: { courseId: number }) {
  const { mutate, isPending, error } = useSendToReview();
  const missing = error instanceof ApiError && error.code === 'CURSO_INCOMPLETO' ? error.details : [];
  return (
    <section aria-label="Enviar a revisión" className="flex max-w-2xl flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <p className="text-sm text-slate-700">Cuando el curso esté completo, envíalo a revisión. Un administrador lo aprobará o te dirá qué cambiar.</p>
      <ErrorAlert message={error && missing.length === 0 ? errorMessage(error) : null} />
      {missing.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Antes de enviarlo a revisión:</p>
          <ul className="list-disc pl-5">{missing.map((d) => <li key={d.regla}>{d.mensaje}</li>)}</ul>
        </div>
      )}
      <div><Button disabled={isPending} onClick={() => mutate(courseId)}>Enviar a revisión</Button></div>
    </section>
  );
}
