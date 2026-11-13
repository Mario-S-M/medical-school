import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { ThrottleGuard } from './guards/throttle.guard';
import { AppValidationPipe } from './pipes/validation.pipe';
import { ClientIpService } from './services/client-ip.service';

export const REQUEST_LIMIT = 120;
export const WINDOW_MS = 60_000;

// Filtro de errores, validación con lista blanca (class-validator) y límite general (120 por minuto y por IP, en memoria).
@Global()
@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: WINDOW_MS, limit: REQUEST_LIMIT }] })],
  providers: [
    ClientIpService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
  exports: [ClientIpService, ThrottlerModule], // ThrottlerStorage lo usa el límite de /api/graphql
})
export class CommonModule {}
