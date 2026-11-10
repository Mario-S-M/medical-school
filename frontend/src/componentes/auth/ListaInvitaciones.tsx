import useMisInvitaciones from '../../hooks/useMisInvitaciones';
import TarjetaInvitacion from './TarjetaInvitacion';

// Sección del panel: solo aparece si la cuenta tiene invitaciones pendientes y vigentes.
export default function ListaInvitaciones() {
  const { invitaciones, recargar } = useMisInvitaciones();
  if (invitaciones.length === 0) return null;
  return (
    <section aria-labelledby="invitaciones" className="flex flex-col gap-3">
      <h2 id="invitaciones" className="text-xl font-bold">Invitaciones</h2>
      <ul className="flex flex-col gap-3">
        {invitaciones.map((i) => <TarjetaInvitacion key={i.id} invitacion={i} alResponder={() => void recargar()} />)}
      </ul>
    </section>
  );
}
