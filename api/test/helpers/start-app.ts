import { Controller, Delete, Get, Module, Post, Body, Type } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { configureApp, createAdapter, AppSetupOptions } from '../../src/common/utils/app-setup';
import { ClientIp } from '../../src/common/decorators/client-ip.decorator';
import { CommonModule } from '../../src/common/common.module';

export const FRONT_ORIGIN = 'http://localhost:4321';
export const OPTIONS: AppSetupOptions = {
  frontOrigin: FRONT_ORIGIN,
  trustedProxies: ['loopback', '10.0.0.0/8'],
};

export class EchoDto {
  @IsString({ message: 'Debe ser un texto.' })
  @IsNotEmpty({ message: 'Es obligatorio.' })
  @MaxLength(5, { message: 'Máximo 5 caracteres.' })
  nombre!: string;
}

// Controlador de prueba: existe solo en los tests, nunca en la API real.
@Controller('prueba')
export class TestController {
  @Post('eco')
  eco(@Body() body: EchoDto): EchoDto {
    return body;
  }
  @Delete('eco')
  borrar(): void {
    return;
  }
  @Get('ip')
  ip(@ClientIp() ip: string): { ip: string } {
    return { ip };
  }
  @Get('fallo')
  fallo(): never {
    throw new Error('secreto interno: contrasena_de_la_base');
  }
}

@Module({ imports: [CommonModule], controllers: [TestController] })
export class TestModule {}

// Arranca la app con la capa transversal real. `ready()` es obligatorio antes de usar supertest.
export async function startApp(
  opciones: AppSetupOptions = OPTIONS,
  modulos: Type<unknown>[] = [TestModule],
): Promise<NestFastifyApplication> {
  const modulo = await Test.createTestingModule({ imports: modulos }).compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(createAdapter(opciones), { logger: false });
  configureApp(app, opciones);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
