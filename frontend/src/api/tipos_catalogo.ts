import type { Seccion } from './tipos_escuela';

export type Nivel = 'basico' | 'intermedio' | 'avanzado';
export type TarjetaCurso = {
  slug: string;
  titulo: string;
  subtitulo: string | null;
  nivel: Nivel | null;
  categoria: string | null;
  categoria_slug: string | null;
  instructor: string;
  portada_ruta: string | null;
  secciones: number;
  clases: number;
};
export type Catalogo = { cursos: TarjetaCurso[]; total: number; pagina: number; paginas: number };
export type Consulta = { q?: string; categoria?: string; nivel?: string; pagina?: number };

export type FichaCurso = {
  id: number;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  conocimientos_previos: string | null;
  lo_que_aprenderas: string[];
  nivel: Nivel | null;
  categoria: { nombre: string; slug: string } | null;
  portada_ruta: string | null;
  instructor: string;
  publicado_en: string;
  secciones: Seccion[];
};
