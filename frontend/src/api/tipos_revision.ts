import type { Seccion } from './tipos_escuela';

export type CursoRevision = {
  id: number;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  conocimientos_previos: string | null;
  lo_que_aprenderas: string[];
  nivel: string | null;
  categoria: string | null;
  portada_ruta: string | null;
  instructor: string;
  actualizado_en: string;
  secciones: Seccion[];
};

export type Decision = { curso_id: number; aprobar: boolean; comentario?: string };
