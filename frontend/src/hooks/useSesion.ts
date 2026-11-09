import { useEffect, useSyncExternalStore } from 'react';
import { leerSesion, suscribirSesion, type EstadoSesion } from '../sesion/almacen_sesion';
import { restaurarSesion } from '../sesion/restaurar_sesion';

const INICIAL: EstadoSesion = { estado: 'cargando', sesion: null };
const estadoInicial = () => INICIAL;

export default function useSesion() {
  const actual = useSyncExternalStore(suscribirSesion, leerSesion, estadoInicial);
  useEffect(() => {
    if (actual.estado === 'cargando') void restaurarSesion();
  }, [actual.estado]);
  return actual;
}
