import { useCallback, useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { cursoEdicion } from '../api/escuela';
import type { CursoEdicion } from '../api/tipos_escuela';

export default function useCursoEdicion(id: number) {
  const [curso, setCurso] = useState<CursoEdicion | null>(null);
  const [error, setError] = useState<unknown>(null);
  const recargar = useCallback(
    () => conSesion((token) => cursoEdicion(token, id)).then(setCurso).catch(setError),
    [id],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { curso, error, recargar };
}
