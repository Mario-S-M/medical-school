import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from './common/common.module';
import { AppConfig } from './config/configuration';
import { AppConfigModule } from './config/config.module';
import { databaseOptions } from './database/database-options';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CoursesModule } from './modules/courses/courses.module';
import { CoversModule } from './modules/covers/covers.module';
import { GraphqlModule } from './modules/graphql/graphql.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { MailTemplatesModule } from './modules/mail-templates/mail-templates.module';
import { ReviewModule } from './modules/review/review.module';
import { RolesModule } from './modules/roles/roles.module';
import { StorageModule } from './modules/storage/storage.module';
import { SyllabusModule } from './modules/syllabus/syllabus.module';
import { TeamModule } from './modules/team/team.module';
import { UsersAdminModule } from './modules/users-admin/users-admin.module';
import { VideosModule } from './modules/videos/videos.module';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    AuthModule,
    GraphqlModule,
    MailTemplatesModule,
    HealthModule,
    RolesModule,
    CategoriesModule,
    CoursesModule,
    SyllabusModule,
    CatalogModule,
    ReviewModule,
    TeamModule,
    MailModule,
    StorageModule,
    CoversModule,
    VideosModule,
    UsersAdminModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => databaseOptions(c.getOrThrow<AppConfig['db']>('db')),
    }),
  ],
})
export class AppModule {}
