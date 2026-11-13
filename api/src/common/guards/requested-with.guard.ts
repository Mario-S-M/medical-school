import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiException } from '../utils/api-exception';

// Defensa CSRF de la renovación (antes la hacía Caddy): exige la cabecera personalizada `X-Solicitado-Con: front`.
@Injectable()
export class RequestedWithGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (request.headers['x-solicitado-con'] !== 'front') {
      throw new ApiException(403, 'ORIGEN_NO_PERMITIDO', 'Falta la cabecera X-Solicitado-Con.');
    }
    return true;
  }
}
