import { solicitar } from './cliente';
import type { CursoRevision, Decision } from './tipos_revision';

const ESCUELA = { prefijo: 'escuela' };

export const enviarRevision = (token: string, curso_id: number) =>
  solicitar<{ estado: string }>('POST', 'enviar-revision', { token, cuerpo: { curso_id }, ...ESCUELA });

export const cursosEnRevision = (token: string) =>
  solicitar<{ cursos: CursoRevision[] }>('GET', 'admin/cursos-en-revision', { token, ...ESCUELA });

export const resolverRevision = (token: string, cuerpo: Decision) =>
  solicitar<{ estado: string }>('POST', 'admin/resolver-revision', { token, cuerpo, ...ESCUELA });

export const retirarCurso = (token: string, curso_id: number, comentario: string) =>
  solicitar<{ estado: string }>('POST', 'admin/retirar-curso', { token, cuerpo: { curso_id, comentario }, ...ESCUELA });
