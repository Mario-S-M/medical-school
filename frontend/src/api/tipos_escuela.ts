import type { Seccion } from './tipos_temario';

export type Equipo = { instructor_id: string; nombre_publico: string | null };
export type MisRoles = { roles: string[]; equipos: Equipo[] };

export type Categoria = { id: number; nombre: string; slug: string; posicion: number };
export type DatosCategoria = { id?: number; nombre: string; posicion: number };

export type UsuarioBuscado = {
  id: string;
  correo: string;
  nombre: string | null;
  verificado: boolean;
  roles: string[];
};
export type RolAsignable = 'instructor' | 'administrador';
export type CambioRol = { usuario_id: string; rol: RolAsignable; activo: boolean };

export type EstadoCurso = 'borrador' | 'en_revision' | 'publicado';
export type ResumenCurso = {
  id: number;
  slug: string;
  titulo: string;
  estado: EstadoCurso;
  comentario_revision: string | null;
  portada_ruta: string | null;
  actualizado_en: string;
  es_mio: boolean;
  instructor: string;
};
export type { Clase, Seccion } from './tipos_temario';
export type CursoEdicion = Omit<ResumenCurso, 'es_mio' | 'instructor'> & {
  subtitulo: string | null;
  descripcion: string | null;
  conocimientos_previos: string | null;
  lo_que_aprenderas: string[];
  nivel: 'basico' | 'intermedio' | 'avanzado' | null;
  categoria_id: number | null;
  secciones: Seccion[];
  es_dueno: boolean;
};
export type DatosCurso = Partial<Omit<CursoEdicion, 'id' | 'secciones' | 'es_dueno'>> & { curso_id: number };
