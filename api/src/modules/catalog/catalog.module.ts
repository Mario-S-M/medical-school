import { Module } from '@nestjs/common';
import { CatalogRepository } from './repositories/catalog.repository';
import { CatalogResolver } from './resolvers/catalog.resolver';
import { CatalogService } from './services/catalog.service';

// Catálogo público (SPEC 10, paso 4): `cursos` y `curso`, sin token. `categorias` vive en el módulo `categories`.
@Module({
  providers: [CatalogRepository, CatalogService, CatalogResolver],
  exports: [CatalogRepository],
})
export class CatalogModule {}
