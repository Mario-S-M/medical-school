import { useEffect, useState } from 'react';
import { buscarCursos } from '../api/catalogo';
import type { Catalogo, Consulta } from '../api/tipos_catalogo';

export default function useCatalogo(consulta: Consulta) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const clave = JSON.stringify(consulta);
  useEffect(() => {
    setCatalogo(null);
    buscarCursos(consulta).then(setCatalogo).catch(setError);
  }, [clave]);
  return { catalogo, error };
}
