import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { UsersAdminModule } from '../users-admin/users-admin.module';
import { TeamInvitation } from './entities/team-invitation.entity';
import { TeamMember } from './entities/team-member.entity';
import { TeamRepository } from './repositories/team.repository';
import { TeamResolver } from './resolvers/team.resolver';
import { TeamService } from './services/team.service';

// Equipo de apoyo e invitaciones (SPEC 10, paso 7). Las entidades las comparten `roles` y `courses` (pertenencia al equipo).
@Module({
  imports: [SecurityModule, RolesModule, MailModule, UsersAdminModule, TypeOrmModule.forFeature([TeamMember, TeamInvitation])],
  providers: [TeamRepository, TeamService, TeamResolver],
  exports: [TypeOrmModule],
})
export class TeamModule {}
