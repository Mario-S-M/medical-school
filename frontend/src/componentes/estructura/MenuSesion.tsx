import useSesion from '../../hooks/useSesion';
import BotonCerrarSesion from '../auth/BotonCerrarSesion';

const enlace = 'text-sm text-sky-700 underline';

export default function MenuSesion() {
  const { estado } = useSesion();
  if (estado === 'cargando') return null;
  if (estado === 'anonima') {
    return (
      <div className="flex gap-4">
        <a className={enlace} href="/iniciar-sesion">Iniciar sesión</a>
        <a className={enlace} href="/registro">Crear cuenta</a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <a className={enlace} href="/panel">Panel</a>
      <BotonCerrarSesion />
    </div>
  );
}
