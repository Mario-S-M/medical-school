import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommonModule } from '../../src/common/common.module';
import { configureApp, createAdapter } from '../../src/common/utils/app-setup';
import { AppConfig } from '../../src/config/configuration';
import { databaseOptions } from '../../src/database/database-options';
import { CatalogModule } from '../../src/modules/catalog/catalog.module';
import { CategoriesModule } from '../../src/modules/categories/categories.module';
import { CoursesModule } from '../../src/modules/courses/courses.module';
import { CoversModule } from '../../src/modules/covers/covers.module';
import { GraphqlModule } from '../../src/modules/graphql/graphql.module';
import { ReviewModule } from '../../src/modules/review/review.module';
import { MailModule } from '../../src/modules/mail/mail.module';
import { RolesModule } from '../../src/modules/roles/roles.module';
import { StorageModule } from '../../src/modules/storage/storage.module';
import { SyllabusModule } from '../../src/modules/syllabus/syllabus.module';
import { TeamModule } from '../../src/modules/team/team.module';
import { VideosModule } from '../../src/modules/videos/videos.module';
import { UsersAdminModule } from '../../src/modules/users-admin/users-admin.module';
import { OPTIONS } from './start-app';
import { REPO_ROOT } from './real-env';
import { startSmtpBridge } from './smtp-bridge';

// Valores del `.env` de la raíz (nunca se imprimen). Las pruebas de la escuela ejecutan la app EN PROCESO en modo
// desarrollo (acepta consultas completas) contra el stack real: verifica los tokens reales con `JWT_SECRET`, habla con la base
// `plataforma` por Supavisor (127.0.0.1:5432) y con la API admin de Supabase Auth por Kong (127.0.0.1:8000).
function readEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(resolve(REPO_ROOT, '.env'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return values;
}

function realConfig(mailPort: number, transcoderUrl: string): Partial<AppConfig> {
  const env = readEnv();
  return {
    environment: 'development',
    jwt: { secret: env.JWT_SECRET, issuer: env.API_EXTERNAL_URL },
    auth: { url: `http://127.0.0.1:${env.KONG_HTTP_PORT ?? '8000'}/auth/v1`, timeoutMs: 8000, serviceKey: env.SERVICE_ROLE_KEY },
    // Storage por Kong y SMTP por el puente hacia Mailpit (el SMTP del contenedor no se publica).
    storage: { url: `http://127.0.0.1:${env.KONG_HTTP_PORT ?? '8000'}/storage/v1`, timeoutMs: 15000 },
    // Transcodificador: por defecto una dirección sin servicio (las suites de video levantan uno falso y pasan su URL).
    transcoder: { url: transcoderUrl, secret: env.SECRETO_TRANSCODIFICADOR, timeoutMs: 5000 },
    mail: { host: '127.0.0.1', port: mailPort },
    db: {
      host: '127.0.0.1',
      port: Number(env.POSTGRES_PORT ?? 5432),
      name: 'plataforma',
      user: `${env.USUARIO_BD_PLATAFORMA}.${env.POOLER_TENANT_ID}`,
      password: env.CONTRASENA_BD_PLATAFORMA,
    },
  };
}

// Arranca GraphQL y REST con los módulos de la escuela que existen hasta ahora (se añaden con cada paso de la SPEC 10).
export async function startSchool(options: { transcoderUrl?: string } = {}): Promise<NestFastifyApplication> {
  const bridge = await startSmtpBridge();
  @Global()
  @Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => realConfig(bridge.port, options.transcoderUrl ?? 'http://127.0.0.1:1')] })] })
  class RealConfigModule implements OnApplicationShutdown {
    async onApplicationShutdown(): Promise<void> {
      await bridge.close();
    }
  }

  const module = await Test.createTestingModule({
    imports: [
      RealConfigModule,
      CommonModule,
      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (c: ConfigService) => databaseOptions(c.getOrThrow<AppConfig['db']>('db')),
      }),
      GraphqlModule,
      RolesModule,
      CategoriesModule,
      CoursesModule,
      SyllabusModule,
      CatalogModule,
      ReviewModule,
      StorageModule,
      CoversModule,
      MailModule,
      TeamModule,
      UsersAdminModule,
      VideosModule,
    ],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(createAdapter(OPTIONS), { logger: false });
  configureApp(app, OPTIONS);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
