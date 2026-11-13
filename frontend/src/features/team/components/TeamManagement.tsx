import { errorMessage } from '../../../shared/api/error-messages';
import DeleteButton from '../../../shared/components/DeleteButton';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useMyTeam from '../hooks/use-my-team';
import { useTeamActions } from '../hooks/use-team-mutations';
import InviteForm from './InviteForm';

const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const row = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2';

export default function TeamManagement() {
  const { data: team, error } = useMyTeam();
  const actions = useTeamActions();
  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <a className="text-sm text-sky-700 underline" href="/instructor">← Mis cursos</a>
      <h1 className="text-2xl font-bold">Mi equipo de apoyo</h1>
      <p className="text-slate-600">Quien acepte tu invitación podrá armar el temario de tus cursos. Solo se invita a cuentas ya registradas y verificadas.</p>
      <InviteForm />
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <h2 className="text-xl font-bold">Miembros</h2>
      {team?.miembros.length === 0 && <p className="text-slate-500">Todavía no tienes miembros.</p>}
      <ul className="flex flex-col gap-2">
        {team?.miembros.map((m) => (
          <li key={m.miembro_id} className={row}>
            <span>{m.correo ?? 'Miembro'} <span className="text-sm text-slate-500">desde {date(m.desde)}</span></span>
            <DeleteButton text="Quitar" name={m.correo ?? 'miembro'} action={actions.removeMember(m.miembro_id)} />
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-bold">Invitaciones pendientes</h2>
      {team?.invitaciones.length === 0 && <p className="text-slate-500">No hay invitaciones pendientes.</p>}
      <ul className="flex flex-col gap-2">
        {team?.invitaciones.map((i) => (
          <li key={i.id} className={row}>
            <span>{i.correo} <span className="text-sm text-slate-500">vence el {date(i.expira_en)}</span></span>
            <DeleteButton text="Cancelar" name={i.correo} action={actions.cancelInvitation(i.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
