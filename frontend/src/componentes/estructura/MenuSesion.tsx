import useRoles from '../../hooks/useRoles';
import useSesion from '../../hooks/useSesion';
import BotonCerrarSesion from '../auth/BotonCerrarSesion';

const ghost = 'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';
const primario = 'rounded-lg bg-sky-700 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-800';

export default function MenuSesion() {
  const { estado } = useSesion();
  const { roles } = useRoles();
  if (estado === 'cargando') return <div className="h-8" aria-hidden="true" />;
  if (estado === 'anonima') {
    return (
      <div className="flex items-center gap-1">
        <a className={ghost} href="/iniciar-sesion">Iniciar sesión</a>
        <a className={primario} href="/registro">Crear cuenta</a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {roles.includes('instructor') && <a className={ghost} href="/instructor">Instructor</a>}
      {roles.includes('administrador') && <a className={ghost} href="/admin/roles">Admin</a>}
      <a className={ghost} href="/panel">Panel</a>
      <BotonCerrarSesion />
    </div>
  );
}
