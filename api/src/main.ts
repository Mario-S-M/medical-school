import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { readConfig } from './config/configuration';
import { configureApp, createAdapter } from './common/utils/app-setup';

async function bootstrap(): Promise<void> {
  const config = readConfig(); // falla pronto si el entorno es inválido
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(config));
  configureApp(app, config);
  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((error: Error) => {
  console.error('No se pudo arrancar la API:', error.message);
  process.exit(1);
});
