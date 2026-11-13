import { useEffect, type ReactNode } from 'react';
import { goTo } from '../../../shared/lib/navigate';
import useSession from '../hooks/use-session';

type Props = { children: ReactNode; redirectTo?: string };

export default function SessionGuard({ children, redirectTo = '/iniciar-sesion' }: Props) {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'anonymous') void goTo(redirectTo, true);
  }, [status, redirectTo]);
  if (status !== 'authenticated') return <p role="status" className="text-center text-slate-500">Cargando…</p>;
  return <>{children}</>;
}
