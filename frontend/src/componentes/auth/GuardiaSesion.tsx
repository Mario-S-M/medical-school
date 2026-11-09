import { useEffect, type ReactNode } from 'react';
import useSesion from '../../hooks/useSesion';
import { navegar } from '../../sesion/navegar';

type Props = { children: ReactNode; ir_a?: string };

export default function GuardiaSesion({ children, ir_a = '/iniciar-sesion' }: Props) {
  const { estado } = useSesion();
  useEffect(() => {
    if (estado === 'anonima') void navegar(ir_a, true);
  }, [estado, ir_a]);
  if (estado !== 'autenticada') return <p role="status" className="text-center text-slate-500">Cargando…</p>;
  return <>{children}</>;
}
