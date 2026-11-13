import useMyInvitations from '../hooks/use-my-invitations';
import InvitationCard from './InvitationCard';

// Sección del panel: solo aparece si la cuenta tiene invitaciones pendientes y vigentes.
export default function InvitationList() {
  const { invitations } = useMyInvitations();
  if (invitations.length === 0) return null;
  return (
    <section aria-labelledby="invitaciones" className="flex flex-col gap-3">
      <h2 id="invitaciones" className="text-xl font-bold">Invitaciones</h2>
      <ul className="flex flex-col gap-3">
        {invitations.map((i) => <InvitationCard key={i.id} invitation={i} />)}
      </ul>
    </section>
  );
}
