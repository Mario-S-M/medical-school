import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface SubmitResult {
  missing: string[];
  status: string;
  submitted: boolean;
}

export type ResolveResult = 'ok' | 'not_found' | 'invalid_state' | 'missing_comment';
export type RetireResult = 'ok' | 'not_found' | 'invalid_state';

export interface ReviewRow {
  id: string;
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
  actualizado_en: Date;
}

// Las tres transiciones de estado son una sola sentencia cada una (comprobar y cambiar a la vez), así dos peticiones a la vez
// no pueden resolver el mismo curso dos veces. El SQL es el de los workflows `enviar-a-revision`, `resolver-revision` y
// `retirar-curso`.
@Injectable()
export class ReviewRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Calcula lo que falta y, si no falta nada y está en borrador, lo pasa a `en_revision` (borra el comentario anterior).
  async submit(courseId: number): Promise<SubmitResult> {
    const rows = await this.dataSource.query<{ faltas: string[]; estado: string; enviado: boolean }[]>(
      `WITH c AS (SELECT * FROM escuela.cursos WHERE id = $1::bigint),
       faltas AS (
         SELECT array_remove(ARRAY[
           CASE WHEN coalesce(trim(c.subtitulo), '') = '' THEN 'falta_subtitulo' END,
           CASE WHEN coalesce(trim(c.descripcion), '') = '' THEN 'falta_descripcion' END,
           CASE WHEN c.nivel IS NULL THEN 'falta_nivel' END,
           CASE WHEN c.categoria_id IS NULL THEN 'falta_categoria' END,
           CASE WHEN c.portada_ruta IS NULL THEN 'falta_portada' END,
           CASE WHEN NOT EXISTS (SELECT 1 FROM escuela.secciones s WHERE s.curso_id = c.id) THEN 'falta_secciones' END,
           CASE WHEN EXISTS (SELECT 1 FROM escuela.secciones s WHERE s.curso_id = c.id
                             AND NOT EXISTS (SELECT 1 FROM escuela.clases k WHERE k.seccion_id = s.id)) THEN 'seccion_vacia' END,
           CASE WHEN EXISTS (SELECT 1 FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE s.curso_id = c.id
                             AND NOT EXISTS (SELECT 1 FROM escuela.videos_clase v WHERE v.clase_id = k.id AND v.vigente AND v.estado = 'listo')) THEN 'falta_video' END
         ], NULL) AS lista FROM c
       ), enviado AS (
         UPDATE escuela.cursos SET estado = 'en_revision', comentario_revision = NULL, actualizado_en = now()
         WHERE id = $1::bigint AND estado = 'borrador' AND cardinality((SELECT lista FROM faltas)) = 0 RETURNING id
       )
       SELECT (SELECT lista FROM faltas) AS faltas, (SELECT estado FROM c) AS estado, EXISTS (SELECT 1 FROM enviado) AS enviado`,
      [courseId],
    );
    const row = rows[0];
    return { missing: row.faltas ?? [], status: row.estado, submitted: row.enviado };
  }

  // Aprobar publica (fija `publicado_en`); devolver exige comentario y deja el curso en borrador.
  async resolve(courseId: number, approve: boolean, comment: string | null): Promise<ResolveResult> {
    const rows = await this.dataSource.query<{ resultado: string }[]>(
      `WITH c AS (SELECT id, estado FROM escuela.cursos WHERE id = $1::bigint),
       permitido AS (SELECT (SELECT estado FROM c) = 'en_revision' AND ($2::boolean OR $3::text IS NOT NULL) AS v),
       resuelto AS (
         UPDATE escuela.cursos SET
           estado = CASE WHEN $2::boolean THEN 'publicado' ELSE 'borrador' END,
           comentario_revision = CASE WHEN $2::boolean THEN NULL ELSE $3::text END,
           publicado_en = CASE WHEN $2::boolean THEN now() ELSE publicado_en END,
           actualizado_en = now()
         WHERE id = $1::bigint AND (SELECT v FROM permitido) RETURNING id
       )
       SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM c) THEN 'no_encontrado'
                   WHEN (SELECT estado FROM c) <> 'en_revision' THEN 'estado_invalido'
                   WHEN NOT (SELECT v FROM permitido) THEN 'falta_comentario' ELSE 'ok' END AS resultado`,
      [courseId, approve, comment],
    );
    const map: Record<string, ResolveResult> = { ok: 'ok', no_encontrado: 'not_found', estado_invalido: 'invalid_state', falta_comentario: 'missing_comment' };
    return map[rows[0].resultado];
  }

  // Un curso publicado vuelve a borrador con el comentario del administrador y sale del catálogo.
  async retire(courseId: number, comment: string): Promise<RetireResult> {
    const rows = await this.dataSource.query<{ resultado: string }[]>(
      `WITH c AS (SELECT id, estado FROM escuela.cursos WHERE id = $1::bigint),
       retirado AS (
         UPDATE escuela.cursos SET estado = 'borrador', comentario_revision = $2::text, actualizado_en = now()
         WHERE id = $1::bigint AND estado = 'publicado' RETURNING id
       )
       SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM c) THEN 'no_encontrado'
                   WHEN EXISTS (SELECT 1 FROM retirado) THEN 'ok' ELSE 'estado_invalido' END AS resultado`,
      [courseId, comment],
    );
    const map: Record<string, RetireResult> = { ok: 'ok', no_encontrado: 'not_found', estado_invalido: 'invalid_state' };
    return map[rows[0].resultado];
  }

  // Cursos `en_revision`, del que lleva más tiempo esperando al más reciente (la fecha de la última edición).
  findPending(): Promise<ReviewRow[]> {
    return this.dataSource.query<ReviewRow[]>(
      `SELECT c.id, c.slug, c.titulo, c.subtitulo, c.descripcion, c.conocimientos_previos, c.lo_que_aprenderas, c.nivel,
              cat.nombre AS categoria, c.portada_ruta, coalesce(p.nombre_publico, 'Instructor') AS instructor, c.actualizado_en
       FROM escuela.cursos c
       LEFT JOIN escuela.categorias cat ON cat.id = c.categoria_id
       LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = c.instructor_id
       WHERE c.estado = 'en_revision'
       ORDER BY c.actualizado_en, c.id`,
    );
  }
}
