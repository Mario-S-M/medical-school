import { iniciarSesion } from '../api/autenticacion';
import { ErrorApi } from '../api/errores';
import { guardarSesion } from '../sesion/almacen_sesion';
import { guardarCorreoPendiente } from '../sesion/correo_pendiente';
import useEnvio from './useEnvio';

export default function useInicioSesion(correo: string, contrasena: string) {
  const accion = async () => {
    try {
      return await iniciarSesion({ correo: correo.trim(), contrasena });
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'CORREO_NO_VERIFICADO') {
        guardarCorreoPendiente(correo.trim());
        window.location.assign('/verificar-correo');
      }
      throw e;
    }
  };
  return useEnvio(accion, (r) => {
    guardarSesion({ token_acceso: r.token_acceso, usuario: r.usuario });
    window.location.assign('/panel');
  });
}
