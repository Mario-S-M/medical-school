import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { Lesson } from '../syllabus/entities/lesson.entity';
import { Section } from '../syllabus/entities/section.entity';
import { LessonVideo } from '../videos/entities/lesson-video.entity';
import { Course } from './entities/course.entity';
import { CourseAccessPolicy } from './policies/course-access.policy';
import { CourseAccessRepository } from './repositories/course-access.repository';
import { CoursesRepository } from './repositories/courses.repository';
import { CoursesResolver } from './resolvers/courses.resolver';
import { CoursesService } from './services/courses.service';

// Cursos (SPEC 10, paso 3). `CourseAccessPolicy` es la única política de acceso a un curso: los módulos que escriben sobre
// él (temario, revisión, portadas, equipo, videos) importan este módulo y la usan.
@Module({
  imports: [SecurityModule, RolesModule, TypeOrmModule.forFeature([Course, Section, Lesson, LessonVideo])],
  providers: [CourseAccessRepository, CourseAccessPolicy, CoursesRepository, CoursesService, CoursesResolver],
  exports: [TypeOrmModule, CourseAccessPolicy, CourseAccessRepository],
})
export class CoursesModule {}
