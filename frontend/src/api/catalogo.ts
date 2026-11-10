import { solicitar } from './cliente';
import type { Catalogo, Consulta, FichaCurso } from './tipos_catalogo';

const ESCUELA = { prefijo: 'escuela' };

export function buscarCursos(consulta: Consulta) {
  const params = new URLSearchParams();
  Object.entries(consulta).forEach(([clave, valor]) => valor && params.set(clave, String(valor)));
  return solicitar<Catalogo>('GET', `cursos?${params}`, ESCUELA);
}

export const cursoPublico = (slug: string) =>
  solicitar<FichaCurso>('GET', `curso?slug=${encodeURIComponent(slug)}`, ESCUELA);
