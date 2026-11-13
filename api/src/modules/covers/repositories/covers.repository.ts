import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class CoversRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Guarda la ruta nueva en una sola consulta y devuelve la anterior (la misma del workflow `confirmar-portada`).
  async replace(courseId: number, path: string): Promise<{ previous: string | null; saved: boolean }> {
    const rows = await this.dataSource.query<{ anterior: string | null; guardada: boolean }[]>(
      `WITH anterior AS (SELECT portada_ruta FROM escuela.cursos WHERE id = $1::bigint),
            nueva AS (UPDATE escuela.cursos SET portada_ruta = $2::text, actualizado_en = now() WHERE id = $1::bigint RETURNING id)
       SELECT (SELECT portada_ruta FROM anterior) AS anterior, EXISTS (SELECT 1 FROM nueva) AS guardada`,
      [courseId, path],
    );
    return { previous: rows[0].anterior, saved: rows[0].guardada };
  }
}
