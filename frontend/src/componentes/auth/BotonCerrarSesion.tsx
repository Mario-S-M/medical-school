import { cerrarSesion } from '../../api/autenticacion';
import useSesion from '../../hooks/useSesion';
import { guardarSesion } from '../../sesion/almacen_sesion';
import Boton from '../ui/Boton';

export default function BotonCerrarSesion() {
  const { sesion } = useSesion();
  const salir = async () => {
    try {
      if (sesion) await cerrarSesion(sesion.token_acceso);
    } finally {
      guardarSesion(null);
      window.location.assign('/iniciar-sesion');
    }
  };
  return <Boton variante="secundario" onClick={() => void salir()}>Cerrar sesión</Boton>;
}
