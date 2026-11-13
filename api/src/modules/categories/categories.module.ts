import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { Category } from './entities/category.entity';
import { CategoriesRepository } from './repositories/categories.repository';
import { CategoriesResolver } from './resolvers/categories.resolver';
import { CategoriesService } from './services/categories.service';

@Module({
  imports: [SecurityModule, RolesModule, TypeOrmModule.forFeature([Category])],
  providers: [CategoriesRepository, CategoriesService, CategoriesResolver],
  exports: [TypeOrmModule],
})
export class CategoriesModule {}
