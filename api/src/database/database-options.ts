import { DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { CodeEvent } from '../modules/auth/entities/code-event.entity';
import { CommonPassword } from '../modules/auth/entities/common-password.entity';
import { LoginAttempt } from '../modules/auth/entities/login-attempt.entity';
import { Category } from '../modules/categories/entities/category.entity';
import { Course } from '../modules/courses/entities/course.entity';
import { InstructorProfile } from '../modules/roles/entities/instructor-profile.entity';
import { UserRole } from '../modules/roles/entities/user-role.entity';
import { Lesson } from '../modules/syllabus/entities/lesson.entity';
import { Section } from '../modules/syllabus/entities/section.entity';
import { TeamInvitation } from '../modules/team/entities/team-invitation.entity';
import { TeamMember } from '../modules/team/entities/team-member.entity';
import { LessonVideo } from '../modules/videos/entities/lesson-video.entity';
import { VideoKey } from '../modules/videos/entities/video-key.entity';
import { CreateAuthSchema1762900000000 } from './migrations/1762900000000-create-auth-schema';
import { CreateSchoolCore1762900000002 } from './migrations/1762900000002-create-school-core';
import { CreateSyllabus1762900000003 } from './migrations/1762900000003-create-syllabus';
import { CreateTeam1762900000004 } from './migrations/1762900000004-create-team';
import { CreateVideos1762900000005 } from './migrations/1762900000005-create-videos';
import { LoadCommonPasswords1762900000001 } from './migrations/1762900000001-load-common-passwords';

export function databaseOptions(c: AppConfig['db']): DataSourceOptions {
  return {
    type: 'postgres',
    host: c.host,
    port: c.port,
    database: c.name,
    username: c.user,
    password: c.password,
    synchronize: false,
    entities: [
      LoginAttempt,
      CommonPassword,
      CodeEvent,
      UserRole,
      InstructorProfile,
      Category,
      Course,
      Section,
      Lesson,
      TeamMember,
      TeamInvitation,
      LessonVideo,
      VideoKey,
    ],
    migrations: [
      CreateAuthSchema1762900000000,
      LoadCommonPasswords1762900000001,
      CreateSchoolCore1762900000002,
      CreateSyllabus1762900000003,
      CreateTeam1762900000004,
      CreateVideos1762900000005,
    ],
    migrationsRun: false,
  };
}
