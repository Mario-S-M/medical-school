import { useCallback, useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { misCursos } from '../api/escuela';
import type { ResumenCurso } from '../api/tipos_escuela';

export default function useMisCursos() {
  const [cursos, setCursos] = useState<ResumenCurso[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const recargar = useCallback(
    () => conSesion(misCursos).then((r) => setCursos(r.cursos)).catch(setError),
    [],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { cursos, error, recargar };
}
