import { Args, Query, Resolver } from '@nestjs/graphql';
import { CatalogArgs, CourseSlugArgs } from '../dto/catalog.args';
import { CourseDetail, CoursePage } from '../models/catalog.models';
import { CatalogService } from '../services/catalog.service';

// Consultas públicas: sin `@Authenticated()` ni `@Roles()` (no piden token). El límite de peticiones por IP sí aplica: lo pone
// la protección de la ruta de GraphQL, no la guardia.
@Resolver()
export class CatalogResolver {
  constructor(private readonly catalog: CatalogService) {}

  @Query(() => CoursePage, { name: 'cursos', description: 'Catálogo público: cursos publicados, 12 por página (pública, sin sesión).' })
  list(@Args() args: CatalogArgs): Promise<CoursePage> {
    return this.catalog.list(args);
  }

  @Query(() => CourseDetail, { name: 'curso', description: 'Ficha pública de un curso publicado por su slug (pública, sin sesión).' })
  detail(@Args() args: CourseSlugArgs): Promise<CourseDetail> {
    return this.catalog.detail(args.slug);
  }
}
