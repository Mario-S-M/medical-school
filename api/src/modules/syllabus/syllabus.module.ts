import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesModule } from '../courses/courses.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { VideosModule } from '../videos/videos.module';
import { Lesson } from './entities/lesson.entity';
import { Section } from './entities/section.entity';
import { SyllabusRepository } from './repositories/syllabus.repository';
import { SyllabusResolver } from './resolvers/syllabus.resolver';
import { SyllabusService } from './services/syllabus.service';

// Temario (SPEC 10, paso 3): secciones, clases y orden. El acceso lo decide `CourseAccessPolicy` (módulo `courses`) y el
// borrado de archivos de video lo hará `VideoFilesCleaner` (módulo `videos`).
@Module({
  imports: [SecurityModule, RolesModule, CoursesModule, VideosModule, TypeOrmModule.forFeature([Section, Lesson])],
  providers: [SyllabusRepository, SyllabusService, SyllabusResolver],
  exports: [TypeOrmModule],
})
export class SyllabusModule {}
