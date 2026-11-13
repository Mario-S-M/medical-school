import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { configureApp, createAdapter } from '../../src/common/utils/app-setup';
import { CommonModule } from '../../src/common/common.module';
import { GraphqlModule } from '../../src/modules/graphql/graphql.module';
import { OPTIONS } from './start-app';

// Clave y emisor solo de prueba: la app en proceso verifica los tokens que firma la propia prueba (no usa secretos reales).
export const TEST_SECRET = 'secreto-de-prueba-solo-para-e2e-0123456789';
export const TEST_ISSUER = 'http://emisor.prueba';

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signToken(carga: Record<string, unknown> = {}, secret = TEST_SECRET): string {
  const ahora = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: '11111111-2222-4333-8444-555555555555',
    email: 'ana@example.com',
    role: 'authenticated',
    aud: 'authenticated',
    iss: TEST_ISSUER,
    exp: ahora + 900,
    user_metadata: { nombre: 'Ana Prueba' },
    ...carga,
  })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

// Arranca solo la capa transversal y GraphQL (sin base de datos) con el `NODE_ENV` pedido.
export async function startGraphql(environment: 'development' | 'production'): Promise<NestFastifyApplication> {
  @Global()
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ environment, jwt: { secret: TEST_SECRET, issuer: TEST_ISSUER } })],
      }),
    ],
  })
  class TestConfigModule {}

  const modulo = await Test.createTestingModule({ imports: [TestConfigModule, CommonModule, GraphqlModule] }).compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(createAdapter(OPTIONS), { logger: false });
  configureApp(app, OPTIONS);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
