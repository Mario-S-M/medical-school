import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { ApiException, ERROR_MESSAGES } from '../utils/api-exception';
import { clientIp } from '../utils/client-ip';

// Límite general por IP real del cliente; al pasarlo responde 429 con el formato uniforme y `Retry-After`.
@Injectable()
export class ThrottleGuard extends ThrottlerGuard {
  // En GraphQL el límite se cuenta una vez por petición HTTP (ver `graphql-protections.ts`), no por campo resuelto.
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(context.getType<string>() === 'graphql');
  }

  protected getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(request as unknown as FastifyRequest));
  }

  protected throwThrottlingException(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const seconds = Math.max(1, detail.timeToBlockExpire || detail.timeToExpire);
    throw new ApiException(
      429,
      'DEMASIADAS_SOLICITUDES',
      ERROR_MESSAGES.DEMASIADAS_SOLICITUDES,
      undefined,
      seconds,
      { 'Retry-After': String(seconds) },
    );
  }
}
