import { useEffect, useState } from 'react';
import { cursoPublico } from '../api/catalogo';
import type { FichaCurso } from '../api/tipos_catalogo';

export default function useFichaCurso(slug: string) {
  const [curso, setCurso] = useState<FichaCurso | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    cursoPublico(slug).then(setCurso).catch(setError);
  }, [slug]);
  return { curso, error };
}
