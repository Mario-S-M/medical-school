import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { CatalogArgs } from '../dto/catalog.args';
import { CourseCard, CourseDetail, CoursePage } from '../models/catalog.models';
import { CardRow, CatalogRepository, DetailRow, PAGE_SIZE } from '../repositories/catalog.repository';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async list(args: CatalogArgs): Promise<CoursePage> {
    const page = args.pagina ?? 1;
    const { total, cards } = await this.repository.findPage({ q: args.q ?? null, category: args.categoria ?? null, level: args.nivel ?? null, page });
    return { courses: cards.map(CatalogService.toCard), total, page, pages: Math.ceil(total / PAGE_SIZE) };
  }

  // Un curso que no existe o no está publicado da el mismo NO_ENCONTRADO.
  async detail(slug: string): Promise<CourseDetail> {
    const row = await this.repository.findPublished(slug);
    if (!row) throw new ApiException(404, 'NO_ENCONTRADO', 'El curso no existe.');
    const id = Number(row.id);
    const sections = (await this.repository.findTrees([id])).get(id) ?? [];
    return CatalogService.toDetail(row, sections);
  }

  static toCard(row: CardRow): CourseCard {
    return {
      slug: row.slug,
      title: row.titulo,
      subtitle: row.subtitulo,
      level: row.nivel,
      category: row.categoria,
      categorySlug: row.categoria_slug,
      instructor: row.instructor,
      coverPath: row.portada_ruta,
      sectionCount: Number(row.secciones),
      lessonCount: Number(row.clases),
    };
  }

  static toDetail(row: DetailRow, sections: CourseDetail['sections']): CourseDetail {
    return {
      id: Number(row.id),
      slug: row.slug,
      title: row.titulo,
      subtitle: row.subtitulo,
      description: row.descripcion,
      prerequisites: row.conocimientos_previos,
      learningOutcomes: row.lo_que_aprenderas,
      level: row.nivel,
      category: row.categoria_slug === null || row.categoria_nombre === null ? null : { name: row.categoria_nombre, slug: row.categoria_slug },
      coverPath: row.portada_ruta,
      instructor: row.instructor,
      publishedAt: row.publicado_en ? row.publicado_en.toISOString() : null,
      sections,
    };
  }
}
