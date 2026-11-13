import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { rowsOf } from '../../../common/utils/query-rows';
import { Direction, moveItem } from '../utils/reorder';

export interface LessonFields {
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
  isSample: boolean;
}

export type MoveOutcome = 'moved' | 'unchanged' | 'not_found';

type IdRow = { id: string };

// Todo lo que cambia el orden va en una transacción que primero bloquea la fila del curso (así dos peticiones a la vez no
// calculan la misma posición). Las restricciones de posición son `DEFERRABLE INITIALLY DEFERRED`: se comprueban al
// confirmar, por eso un intercambio o una renumeración pueden pasar por posiciones repetidas dentro de la transacción.
// Las posiciones de cada nivel quedan siempre en `1..n`. Los triggers `tocar_curso_*` actualizan `cursos.actualizado_en`.
@Injectable()
export class SyllabusRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private lockCourse(manager: EntityManager, courseId: number): Promise<unknown> {
    return manager.query('SELECT id FROM escuela.cursos WHERE id = $1::bigint FOR UPDATE', [courseId]);
  }

  // Sin `sectionId` crea la sección al final; con él cambia el título. `null` si no existe en este curso.
  saveSection(courseId: number, sectionId: number | null, title: string): Promise<number | null> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCourse(manager, courseId);
      const rows = rowsOf<IdRow>(
        sectionId === null
          ? await manager.query<IdRow[]>(
              `INSERT INTO escuela.secciones (curso_id, titulo, posicion)
               VALUES ($1::bigint, $2::text, coalesce((SELECT max(posicion) FROM escuela.secciones WHERE curso_id = $1::bigint), 0) + 1) RETURNING id`,
              [courseId, title],
            )
          : await manager.query<IdRow[]>('UPDATE escuela.secciones SET titulo = $3::text WHERE id = $2::bigint AND curso_id = $1::bigint RETURNING id', [
              courseId,
              sectionId,
              title,
            ]),
      );
      return rows[0] ? Number(rows[0].id) : null;
    });
  }

  // Sin `lessonId` crea la clase al final de la sección; con él la edita. `null` si no existe en esta sección.
  saveLesson(courseId: number, sectionId: number, lessonId: number | null, fields: LessonFields): Promise<number | null> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCourse(manager, courseId);
      const values = [sectionId, fields.title, fields.description, fields.estimatedMinutes, fields.isSample];
      const rows = rowsOf<IdRow>(
        lessonId === null
          ? await manager.query<IdRow[]>(
              `INSERT INTO escuela.clases (seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion)
               VALUES ($1::bigint, $2::text, $3::text, $4::int, $5::boolean, coalesce((SELECT max(posicion) FROM escuela.clases WHERE seccion_id = $1::bigint), 0) + 1)
               RETURNING id`,
              values,
            )
          : await manager.query<IdRow[]>(
              `UPDATE escuela.clases SET titulo = $2::text, descripcion = $3::text, duracion_estimada_minutos = $4::int, es_muestra = $5::boolean
               WHERE id = $6::bigint AND seccion_id = $1::bigint RETURNING id`,
              [...values, lessonId],
            ),
      );
      return rows[0] ? Number(rows[0].id) : null;
    });
  }

  // Borra la sección (sus clases y videos caen por `ON DELETE CASCADE`) y renumera las demás. Devuelve las rutas base de
  // los videos que tenía (para borrar sus archivos) o `null` si la sección ya no existía.
  deleteSection(courseId: number, sectionId: number): Promise<string[] | null> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCourse(manager, courseId);
      const paths = await manager.query<{ ruta_base: string }[]>(
        `SELECT v.ruta_base FROM escuela.videos_clase v JOIN escuela.clases k ON k.id = v.clase_id WHERE k.seccion_id = $1::bigint`,
        [sectionId],
      );
      const deleted = rowsOf<IdRow>(await manager.query('DELETE FROM escuela.secciones WHERE id = $1::bigint AND curso_id = $2::bigint RETURNING id', [sectionId, courseId]));
      if (deleted.length === 0) return null;
      await this.renumberSections(manager, courseId);
      return paths.map((row) => row.ruta_base);
    });
  }

  deleteLesson(courseId: number, lessonId: number): Promise<string[] | null> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCourse(manager, courseId);
      const paths = await manager.query<{ ruta_base: string }[]>('SELECT ruta_base FROM escuela.videos_clase WHERE clase_id = $1::bigint', [lessonId]);
      const deleted = rowsOf<{ seccion_id: string }>(await manager.query('DELETE FROM escuela.clases WHERE id = $1::bigint RETURNING seccion_id', [lessonId]));
      if (deleted.length === 0) return null;
      await this.renumberLessons(manager, deleted[0].seccion_id);
      return paths.map((row) => row.ruta_base);
    });
  }

  // Sube o baja un lugar entre sus hermanos (las secciones del curso o las clases de la sección) y deja `1..n`.
  move(courseId: number, type: 'seccion' | 'clase', id: number, direction: Direction): Promise<MoveOutcome> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockCourse(manager, courseId);
      const siblings =
        type === 'seccion'
          ? await manager.query<IdRow[]>('SELECT id FROM escuela.secciones WHERE curso_id = $1::bigint ORDER BY posicion, id', [courseId])
          : await manager.query<IdRow[]>(
              `SELECT id FROM escuela.clases WHERE seccion_id = (SELECT seccion_id FROM escuela.clases WHERE id = $1::bigint) ORDER BY posicion, id`,
              [id],
            );
      const moved = moveItem(
        siblings.map((row) => row.id),
        String(id),
        direction,
      );
      if (!moved) return 'not_found';
      if (!moved.changed) return 'unchanged';
      const table = type === 'seccion' ? 'escuela.secciones' : 'escuela.clases';
      await manager.query(
        `UPDATE ${table} t SET posicion = n.posicion FROM unnest($1::bigint[], $2::int[]) AS n(id, posicion) WHERE t.id = n.id AND t.posicion <> n.posicion`,
        [moved.order, moved.order.map((_, index) => index + 1)],
      );
      return 'moved';
    });
  }

  private renumberSections(manager: EntityManager, courseId: number): Promise<unknown> {
    return manager.query(
      `UPDATE escuela.secciones s SET posicion = n.nueva
       FROM (SELECT id, row_number() OVER (ORDER BY posicion, id) AS nueva FROM escuela.secciones WHERE curso_id = $1::bigint) n
       WHERE s.id = n.id AND s.posicion <> n.nueva`,
      [courseId],
    );
  }

  private renumberLessons(manager: EntityManager, sectionId: string): Promise<unknown> {
    return manager.query(
      `UPDATE escuela.clases k SET posicion = n.nueva
       FROM (SELECT id, row_number() OVER (ORDER BY posicion, id) AS nueva FROM escuela.clases WHERE seccion_id = $1::bigint) n
       WHERE k.id = n.id AND k.posicion <> n.nueva`,
      [sectionId],
    );
  }
}
