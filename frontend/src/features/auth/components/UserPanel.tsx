import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import InvitationList from '../../team/components/InvitationList';
import useMe from '../hooks/use-me';
import LogoutButton from './LogoutButton';

export default function UserPanel() {
  const { data: user, isError } = useMe();
  if (isError) return <ErrorAlert message="No pudimos cargar tu perfil. Inténtalo de nuevo." />;
  if (!user) return <p role="status">Cargando…</p>;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Hola, {user.nombre}</h1>
      <p className="text-slate-600">Sesión iniciada como <strong>{user.correo}</strong>.</p>
      <InvitationList />
      <div><LogoutButton /></div>
    </section>
  );
}
