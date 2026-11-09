import type { ReactNode } from 'react';
import useSesion from '../../hooks/useSesion';

type Props = { children: ReactNode; ir_a?: string };

export default function GuardiaSesion({ children, ir_a = '/iniciar-sesion' }: Props) {
  const { estado } = useSesion();
  if (estado === 'cargando') return <p role="status">Cargando…</p>;
  if (estado === 'anonima') {
    window.location.replace(ir_a);
    return null;
  }
  return <>{children}</>;
}
