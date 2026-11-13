import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CoursesModule } from '../courses/courses.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { ReviewRepository } from './repositories/review.repository';
import { ReviewResolver } from './resolvers/review.resolver';
import { ReviewService } from './services/review.service';

// Revisión de cursos (SPEC 10, paso 5): enviar a revisión (instructor dueño) y resolver, listar y retirar (administrador).
@Module({
  imports: [SecurityModule, RolesModule, CoursesModule, CatalogModule],
  providers: [ReviewRepository, ReviewService, ReviewResolver],
})
export class ReviewModule {}
