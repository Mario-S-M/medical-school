import { useCallback, useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { cursosEnRevision } from '../api/revision';
import type { CursoRevision } from '../api/tipos_revision';

export default function useCursosEnRevision() {
  const [cursos, setCursos] = useState<CursoRevision[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const recargar = useCallback(
    () => conSesion(cursosEnRevision).then((r) => setCursos(r.cursos)).catch(setError),
    [],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { cursos, error, recargar };
}
