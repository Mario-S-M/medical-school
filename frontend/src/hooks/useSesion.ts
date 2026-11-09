import { useEffect, useSyncExternalStore } from 'react';
import { leerSesion, suscribirSesion } from '../sesion/almacen_sesion';
import { restaurarSesion } from '../sesion/restaurar_sesion';

const estadoInicial = () => ({ estado: 'cargando' as const, sesion: null });

export default function useSesion() {
  const actual = useSyncExternalStore(suscribirSesion, leerSesion, estadoInicial);
  useEffect(() => {
    if (actual.estado === 'cargando') void restaurarSesion();
  }, [actual.estado]);
  return actual;
}
