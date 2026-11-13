import { useEffect } from 'react';
import { refreshSession } from '../api/refresh-session';
import { useSessionStore } from '../store/session-store';

// Estado de la sesión; la primera isla que lo usa la recupera con la cookie de renovación.
export default function useSession() {
  const status = useSessionStore((s) => s.status);
  const session = useSessionStore((s) => s.session);
  useEffect(() => {
    if (status === 'loading') void refreshSession();
  }, [status]);
  return { status, session };
}
