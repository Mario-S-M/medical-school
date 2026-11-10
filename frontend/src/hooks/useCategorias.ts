import { useCallback, useEffect, useState } from 'react';
import { categorias } from '../api/escuela';
import type { Categoria } from '../api/tipos_escuela';

export default function useCategorias() {
  const [lista, setLista] = useState<Categoria[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const recargar = useCallback(
    () => categorias().then((r) => setLista(r.categorias)).catch(setError),
    [],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { lista, error, recargar };
}
