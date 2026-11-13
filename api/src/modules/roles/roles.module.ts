import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../security/security.module';
import { TeamMember } from '../team/entities/team-member.entity';
import { InstructorProfile } from './entities/instructor-profile.entity';
import { UserRole } from './entities/user-role.entity';
import { RolesRepository } from './repositories/roles.repository';
import { RolesResolver } from './resolvers/roles.resolver';
import { RolesService } from './services/roles.service';

// Roles de la plataforma desde la base. Los módulos con `@Roles(...)` importan este módulo (la guardia necesita `RolesService`).
@Module({
  imports: [SecurityModule, TypeOrmModule.forFeature([UserRole, InstructorProfile, TeamMember])],
  providers: [RolesRepository, RolesService, RolesResolver],
  exports: [RolesService, TypeOrmModule],
})
export class RolesModule {}
