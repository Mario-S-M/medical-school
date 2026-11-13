import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SyllabusSection } from '../models/catalog.models';
import { buildTrees, LessonRow, SectionRow } from '../utils/tree';

export const PAGE_SIZE = 12;

export interface CardRow {
  slug: string;
  titulo: string;
  subtitulo: string | null;
  nivel: string | null;
  categoria: string | null;
  categoria_slug: string | null;
  instructor: string;
  portada_ruta: string | null;
  secciones: string;
  clases: string;
}

export interface DetailRow {
  id: string;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  conocimientos_previos: string | null;
  lo_que_aprenderas: string[];
  nivel: string | null;
  categoria_nombre: string | null;
  categoria_slug: string | null;
  portada_ruta: string | null;
  instructor: string;
  publicado_en: Date | null;
}

export interface CatalogFilters {
  q: string | null;
  category: string | null;
  level: string | null;
  page: number;
}

// Consultas de lectura del catálogo público: solo cursos `publicado`, sin campos internos.
@Injectable()
export class CatalogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Una sola consulta: el total de los filtros (cuente o no la página pedida) y las tarjetas de la página, del más relevante
  // al más reciente (misma consulta del workflow `cursos`). La búsqueda de texto completo usa el índice GIN de `busqueda`
  // y también compara el nombre del instructor; las cuentas de secciones y clases solo se calculan para las 12 de la página.
  async findPage(filters: CatalogFilters): Promise<{ total: number; cards: CardRow[] }> {
    const rows = await this.dataSource.query<(Partial<CardRow> & { total: number })[]>(
      `WITH p AS (
         SELECT NULLIF($1::text, '') AS q, NULLIF($2::text, '') AS categoria, NULLIF($3::text, '') AS nivel,
                CASE WHEN NULLIF($1::text, '') IS NULL THEN NULL ELSE websearch_to_tsquery('spanish', escuela.sin_acentos($1::text)) END AS consulta
       ), filtrados AS (
         SELECT c.id, c.slug, c.titulo, c.subtitulo, c.nivel, c.portada_ruta, c.publicado_en,
                cat.nombre AS categoria, cat.slug AS categoria_slug, coalesce(i.nombre_publico, 'Instructor') AS instructor,
                CASE WHEN p.consulta IS NULL THEN 0 ELSE ts_rank(c.busqueda, p.consulta) END AS relevancia
         FROM escuela.cursos c
         LEFT JOIN escuela.categorias cat ON cat.id = c.categoria_id
         LEFT JOIN escuela.perfiles_instructor i ON i.usuario_id = c.instructor_id
         CROSS JOIN p
         WHERE c.estado = 'publicado'
           AND (p.categoria IS NULL OR cat.slug = p.categoria)
           AND (p.nivel IS NULL OR c.nivel = p.nivel)
           AND (p.consulta IS NULL OR c.busqueda @@ p.consulta
                OR to_tsvector('spanish', escuela.sin_acentos(coalesce(i.nombre_publico, ''))) @@ p.consulta)
       )
       SELECT tot.total, t.slug, t.titulo, t.subtitulo, t.nivel, t.categoria, t.categoria_slug, t.instructor, t.portada_ruta, t.secciones, t.clases
       FROM (SELECT count(*)::int AS total FROM filtrados) tot
       LEFT JOIN (
         SELECT f.*,
                (SELECT count(*) FROM escuela.secciones s WHERE s.curso_id = f.id) AS secciones,
                (SELECT count(*) FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE s.curso_id = f.id) AS clases
         FROM (SELECT * FROM filtrados ORDER BY relevancia DESC, publicado_en DESC, id DESC OFFSET $4::int LIMIT ${PAGE_SIZE}) f
       ) t ON true
       ORDER BY t.relevancia DESC, t.publicado_en DESC, t.id DESC`,
      [filters.q, filters.category, filters.level, (filters.page - 1) * PAGE_SIZE],
    );
    return { total: rows[0]?.total ?? 0, cards: rows.filter((row): row is CardRow & { total: number } => row.slug != null) };
  }

  async findPublished(slug: string): Promise<DetailRow | null> {
    const rows = await this.dataSource.query<DetailRow[]>(
      `SELECT c.id, c.slug, c.titulo, c.subtitulo, c.descripcion, c.conocimientos_previos, c.lo_que_aprenderas, c.nivel,
              cat.nombre AS categoria_nombre, cat.slug AS categoria_slug, c.portada_ruta,
              coalesce(i.nombre_publico, 'Instructor') AS instructor, c.publicado_en
       FROM escuela.cursos c
       LEFT JOIN escuela.categorias cat ON cat.id = c.categoria_id
       LEFT JOIN escuela.perfiles_instructor i ON i.usuario_id = c.instructor_id
       WHERE c.slug = $1::text AND c.estado = 'publicado'`,
      [slug],
    );
    return rows[0] ?? null;
  }

  // Temario de varios cursos en dos consultas (por lotes, sin N+1): secciones y clases en su orden. Sin campos de video.
  async findTrees(courseIds: number[]): Promise<Map<number, SyllabusSection[]>> {
    if (courseIds.length === 0) return new Map();
    const sections = await this.dataSource.query<SectionRow[]>(
      `SELECT id, curso_id, titulo, posicion FROM escuela.secciones WHERE curso_id = ANY($1::bigint[]) ORDER BY posicion, id`,
      [courseIds],
    );
    const lessons =
      sections.length === 0
        ? []
        : await this.dataSource.query<LessonRow[]>(
            `SELECT id, seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion
             FROM escuela.clases WHERE seccion_id = ANY($1::bigint[]) ORDER BY posicion, id`,
            [sections.map((section) => section.id)],
          );
    return buildTrees(courseIds, sections, lessons);
  }
}
