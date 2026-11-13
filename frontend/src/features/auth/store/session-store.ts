import { create } from 'zustand';
import { queryClient } from '../../../shared/lib/query-client';
import type { User } from '../schemas/session-schema';

export type Session = { accessToken: string; user: User };
type Status = 'loading' | 'authenticated' | 'anonymous';
type SessionState = { status: Status; session: Session | null; setSession: (session: Session | null) => void };

// Solo en memoria: sin persist, localStorage, sessionStorage ni cookies propias. Al recargar se recupera con `renovar`.
export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'loading',
  session: null,
  setSession: (session) => {
    const previous = get().session;
    // Cerrar sesión o cambiar de usuario descarta el caché para no filtrar datos entre cuentas.
    if (previous && previous.user.id !== session?.user.id) queryClient.clear();
    set(session ? { status: 'authenticated', session } : { status: 'anonymous', session: null });
  },
}));
