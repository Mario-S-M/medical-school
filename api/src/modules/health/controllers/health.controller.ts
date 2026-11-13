import { Controller, Get } from '@nestjs/common';

@Controller('api/v1/salud')
export class HealthController {
  @Get()
  get(): { listo: true } {
    return { listo: true };
  }
}
