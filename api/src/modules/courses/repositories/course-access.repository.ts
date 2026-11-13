import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CourseAccessRow {
  id: number;
  instructorId: string;
  status: string;
  isOwner: boolean;
  isTeam: boolean;
}

// Una sola consulta: resuelve el curso desde el curso, la sección, la clase o el video y dice si el usuario es el dueño o
// está en el equipo de apoyo del instructor dueño (la misma consulta del workflow `validar-acceso-a-curso`).
@Injectable()
export class CourseAccessRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findCourse(type: 'course' | 'section' | 'lesson' | 'video', id: number, userId: string): Promise<CourseAccessRow | null> {
    const rows = await this.dataSource.query<{ id: string; instructor_id: string; estado: string; es_dueno: boolean; es_equipo: boolean }[]>(
      `WITH objetivo AS (
         SELECT CASE $1::text
           WHEN 'course' THEN $2::bigint
           WHEN 'section' THEN (SELECT curso_id FROM escuela.secciones WHERE id = $2::bigint)
           WHEN 'lesson' THEN (SELECT s.curso_id FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE k.id = $2::bigint)
           WHEN 'video' THEN (SELECT s.curso_id FROM escuela.videos_clase v JOIN escuela.clases k ON k.id = v.clase_id JOIN escuela.secciones s ON s.id = k.seccion_id WHERE v.id = $2::bigint)
         END AS curso_id
       )
       SELECT c.id, c.instructor_id, c.estado,
              (c.instructor_id = $3::uuid) AS es_dueno,
              EXISTS (SELECT 1 FROM escuela.equipos_apoyo e WHERE e.instructor_id = c.instructor_id AND e.miembro_id = $3::uuid) AS es_equipo
       FROM objetivo o JOIN escuela.cursos c ON c.id = o.curso_id`,
      [type, id, userId],
    );
    const row = rows[0];
    return row ? { id: Number(row.id), instructorId: row.instructor_id, status: row.estado, isOwner: row.es_dueno, isTeam: row.es_equipo } : null;
  }
}
