import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { useAnswerInvitation } from '../hooks/use-team-mutations';
import type { ReceivedInvitation } from '../schemas/team-schema';

export default function InvitationCard({ invitation }: { invitation: ReceivedInvitation }) {
  const { mutate, isPending, error } = useAnswerInvitation();
  const answer = (aceptar: boolean) => () =>
    mutate({ invitacion_id: invitation.id, aceptar }, { onSuccess: () => aceptar && window.location.assign('/instructor') });
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <p><strong>{invitation.instructor}</strong> te invitó a su equipo de apoyo.</p>
      <p className="text-sm text-slate-500">Vence el {new Date(invitation.expira_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.</p>
      <div className="flex gap-2">
        <Button disabled={isPending} onClick={answer(true)}>Aceptar</Button>
        <Button variant="secondary" disabled={isPending} onClick={answer(false)}>Rechazar</Button>
      </div>
    </li>
  );
}
