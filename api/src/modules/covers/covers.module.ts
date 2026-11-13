import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { StorageModule } from '../storage/storage.module';
import { CoversController } from './controllers/covers.controller';
import { CoversRepository } from './repositories/covers.repository';
import { CoversResolver } from './resolvers/covers.resolver';
import { CoversService } from './services/covers.service';

// Portadas (SPEC 10, paso 6): firma REST de la subida y `confirmar_portada` en GraphQL.
@Module({
  imports: [SecurityModule, RolesModule, CoursesModule, StorageModule],
  controllers: [CoversController],
  providers: [CoversRepository, CoversService, CoversResolver],
})
export class CoversModule {}
