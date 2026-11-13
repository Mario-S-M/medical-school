import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtService } from '../services/jwt.service';

// Exige `Authorization: Bearer <token de acceso>` válido y deja al usuario en la petición (`@CurrentUser()`).
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    request.authenticatedUser = this.jwt.authenticate(request.headers.authorization);
    return true;
  }
}
