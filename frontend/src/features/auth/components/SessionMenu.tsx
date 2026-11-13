import { withQueryClient } from '../../../shared/lib/with-query-client';
import useRoles from '../hooks/use-roles';
import useSession from '../hooks/use-session';
import LogoutButton from './LogoutButton';

const ghost = 'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';
const primary = 'rounded-lg bg-sky-700 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-800';

function SessionMenu() {
  const { status } = useSession();
  const { roles } = useRoles();
  if (status === 'loading') return <div className="h-8" aria-hidden="true" />;
  if (status === 'anonymous') {
    return (
      <div className="flex items-center gap-1">
        <a className={ghost} href="/iniciar-sesion">Iniciar sesión</a>
        <a className={primary} href="/registro">Crear cuenta</a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {(roles.includes('instructor') || roles.includes('equipo_apoyo')) && <a className={ghost} href="/instructor">Instructor</a>}
      {roles.includes('administrador') && <a className={ghost} href="/admin/roles">Admin</a>}
      <a className={ghost} href="/panel">Panel</a>
      <LogoutButton />
    </div>
  );
}

export default withQueryClient(SessionMenu);
