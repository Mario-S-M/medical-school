import { renovar } from '../api/autenticacion';
import { guardarSesion } from './almacen_sesion';

let pendiente: Promise<void> | null = null;

// Pide `renovar` una sola vez por página aunque varias islas lo soliciten.
export function restaurarSesion(): Promise<void> {
  pendiente ??= renovar()
    .then((r) => guardarSesion({ token_acceso: r.token_acceso, usuario: r.usuario }))
    .catch(() => guardarSesion(null));
  return pendiente;
}
