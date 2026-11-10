import { useCallback, useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { miEquipo } from '../api/equipo';
import type { MiEquipo } from '../api/tipos_equipo';

export default function useMiEquipo() {
  const [equipo, setEquipo] = useState<MiEquipo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const recargar = useCallback(() => conSesion(miEquipo).then(setEquipo).catch(setError), []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { equipo, error, recargar };
}
