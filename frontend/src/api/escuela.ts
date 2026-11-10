import { solicitar } from './cliente';
import type {
  CambioRol, Categoria, CursoEdicion, DatosCategoria, DatosCurso, MisRoles, ResumenCurso, UsuarioBuscado,
} from './tipos_escuela';

const ESCUELA = { prefijo: 'escuela' };

export const misRoles = (token: string) => solicitar<MisRoles>('GET', 'mis-roles', { token, ...ESCUELA });

export const categorias = () => solicitar<{ categorias: Categoria[] }>('GET', 'categorias', ESCUELA);

export const buscarUsuario = (token: string, correo: string) =>
  solicitar<UsuarioBuscado>('GET', `admin/buscar-usuario?correo=${encodeURIComponent(correo)}`, { token, ...ESCUELA });

export const asignarRol = (token: string, cuerpo: CambioRol) =>
  solicitar<CambioRol>('POST', 'admin/asignar-rol', { token, cuerpo, ...ESCUELA });

export const guardarCategoria = (token: string, cuerpo: DatosCategoria) =>
  solicitar<{ id: number }>('POST', 'admin/guardar-categoria', { token, cuerpo, ...ESCUELA });

export const borrarCategoria = (token: string, id: number) =>
  solicitar<void>('POST', 'admin/borrar-categoria', { token, cuerpo: { id }, ...ESCUELA });

export const misCursos = (token: string) =>
  solicitar<{ cursos: ResumenCurso[] }>('GET', 'mis-cursos', { token, ...ESCUELA });

export const cursoEdicion = (token: string, id: number) =>
  solicitar<CursoEdicion>('GET', `curso-edicion?id=${id}`, { token, ...ESCUELA });

export const crearCurso = (token: string, titulo: string) =>
  solicitar<{ id: number; slug: string }>('POST', 'crear-curso', { token, cuerpo: { titulo }, ...ESCUELA });

export const editarCurso = (token: string, cuerpo: DatosCurso) =>
  solicitar<{ id: number }>('POST', 'editar-curso', { token, cuerpo, ...ESCUELA });
