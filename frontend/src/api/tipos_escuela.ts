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
