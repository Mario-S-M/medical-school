import { ErrorApi } from './errores';
import { leerSesion } from '../sesion/almacen_sesion';
import { restaurarSesion } from '../sesion/restaurar_sesion';

const token = () => leerSesion().sesion?.token_acceso ?? '';

// Ejecuta una llamada con el token actual; si venció (15 min), renueva la sesión y reintenta una vez.
export async function conSesion<T>(accion: (token: string) => Promise<T>): Promise<T> {
  try {
    return await accion(token());
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.codigo !== 'TOKEN_INVALIDO') throw e;
    await restaurarSesion(true);
    if (!token()) throw e;
    return accion(token());
  }
}
