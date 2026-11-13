import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp, createAdapter } from '../src/common/utils/app-setup';
import { CommonModule } from '../src/common/common.module';
import { GraphqlModule } from '../src/modules/graphql/graphql.module';
import { OPTIONS, TestModule } from './helpers/start-app';
import { TEST_ISSUER, TEST_SECRET } from './helpers/start-graphql';

// Con GraphQL en la misma app, los errores de lectura del cuerpo de las rutas REST siguen el formato uniforme.
describe('REST con GraphQL en la app', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    @Global()
    @Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ environment: 'production', jwt: { secret: TEST_SECRET, issuer: TEST_ISSUER } })],
        }),
      ],
    })
    class TestConfigModule {}
    const modulo = await Test.createTestingModule({ imports: [TestConfigModule, CommonModule, GraphqlModule, TestModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(createAdapter(OPTIONS), { logger: false });
    configureApp(app, OPTIONS);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(() => app.close());

  it('400 JSON_INVALIDO con JSON roto', async () => {
    const r = await request(app.getHttpServer()).post('/prueba/eco').set('Content-Type', 'application/json').send('{"a":').expect(400);
    expect(r.body.error.codigo).toBe('JSON_INVALIDO');
  });

  it('413 CUERPO_DEMASIADO_GRANDE por encima de 10 KB', async () => {
    const r = await request(app.getHttpServer()).post('/prueba/eco').send({ nombre: 'x'.repeat(11 * 1024) }).expect(413);
    expect(r.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });
});
