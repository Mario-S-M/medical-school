import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { SecurityModule } from '../security/security.module';
import { UsersAdminResolver } from './resolvers/users-admin.resolver';
import { AuthAdminService } from './services/auth-admin.service';
import { UsersAdminService } from './services/users-admin.service';

// Administración de cuentas (SPEC 10, paso 2): buscar por correo y dar o quitar roles. Solo administradores.
@Module({
  imports: [SecurityModule, RolesModule],
  providers: [AuthAdminService, UsersAdminService, UsersAdminResolver],
  exports: [AuthAdminService],
})
export class UsersAdminModule {}
