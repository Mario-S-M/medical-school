import { Module } from '@nestjs/common';
import { JwtGuard } from './guards/jwt.guard';
import { JwtService } from './services/jwt.service';

// Módulo compartido: lo importan los módulos que protegen rutas REST y GraphQL.
@Module({
  providers: [JwtService, JwtGuard],
  exports: [JwtService, JwtGuard],
})
export class SecurityModule {}
