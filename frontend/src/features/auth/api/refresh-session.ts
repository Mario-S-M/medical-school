import { renew } from './auth-api';
import { useSessionStore } from '../store/session-store';

let current: Promise<void> | null = null;
let running = false;

// Pide `renew` una sola vez por página aunque varias islas o peticiones lo soliciten a la vez.
// Con `force` renueva de nuevo (el token de acceso venció) salvo que ya haya una renovación en curso.
export function refreshSession(force = false): Promise<void> {
  if (current && (!force || running)) return current;
  running = true;
  current = renew()
    .then((r) => useSessionStore.getState().setSession({ accessToken: r.token_acceso, user: r.usuario }))
    .catch(() => useSessionStore.getState().setSession(null))
    .finally(() => (running = false));
  return current;
}
