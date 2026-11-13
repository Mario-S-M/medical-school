import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { ThrottlerStorage } from '@nestjs/throttler';
import { accessSync, constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import { REQUEST_LIMIT, WINDOW_MS } from '../../common/common.module';
import { restrictMethods } from '../../common/utils/route-registry';
import { AppConfig } from '../../config/configuration';
import { SecurityModule } from '../security/security.module';
import { GraphqlAuthGuard } from './guards/graphql-auth.guard';
import { createErrorFormatter } from './error-formatter';
import { loadManifest } from './persisted-queries';
import { createProtections, GRAPHQL_PATH } from './protections';
import { checkComplexity } from './query-complexity';
import { UserResolver } from './resolvers/user.resolver';

export const SCHEMA_PATH = resolve(__dirname, '../../../graphql/schema.graphql');

// En desarrollo el esquema se escribe en `api/graphql/schema.graphql` (lo lee el codegen del front y va a git). En
// producción, y donde la carpeta no se puede escribir (contenedor de solo lectura), queda solo en memoria. Bajo Jest tampoco
// se escribe (cada suite arma una app con módulos distintos y se pisarían): para regenerarlo, `GRAPHQL_WRITE_SCHEMA=1 npm run test:e2e`.
function schemaDestination(production: boolean): string | true {
  if (production || (process.env.JEST_WORKER_ID !== undefined && process.env.GRAPHQL_WRITE_SCHEMA === undefined)) return true;
  try {
    accessSync(dirname(SCHEMA_PATH), constants.W_OK);
    return SCHEMA_PATH;
  } catch {
    return true;
  }
}

// POST /api/graphql con Mercurius en code-first. Protecciones (SPEC 09):
//  - guardia JWT local en los campos (`@Authenticated()`, `@Roles()`);
//  - profundidad 8 y costo 1000 (`query-complexity.ts`);
//  - producción: solo consultas persistidas, introspección y GraphiQL apagados;
//  - solo POST con JSON, límite de 120 peticiones por minuto y por IP, y errores en el formato uniforme.
@Module({
  imports: [
    SecurityModule,
    GraphQLModule.forRootAsync<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      inject: [ConfigService, ThrottlerStorage],
      useFactory: (config: ConfigService, limitStorage: ThrottlerStorage): MercuriusDriverConfig => {
        const production = config.getOrThrow<AppConfig['environment']>('environment') === 'production';
        const manifest = loadManifest();
        return {
          path: GRAPHQL_PATH,
          autoSchemaFile: schemaDestination(production),
          // `onlyPersisted` en Mercurius también apaga GraphiQL; en desarrollo se acepta todo.
          graphiql: !production,
          persistedQueries: manifest,
          onlyPersisted: production,
          validationRules: production ? [NoSchemaIntrospectionCustomRule] : [],
          errorFormatter: createErrorFormatter(production),
          hooks: { preValidation: (_schema, document) => checkComplexity(document, { allowIntrospection: !production }) },
          additionalRouteOptions: {
            preValidation: createProtections({ production, limitStorage, manifest, limit: REQUEST_LIMIT, windowMs: WINDOW_MS }),
          },
        };
      },
    }),
  ],
  providers: [UserResolver, GraphqlAuthGuard],
})
export class GraphqlModule implements OnModuleInit {
  constructor(
    private readonly host: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const fastify: FastifyInstance = this.host.httpAdapter.getInstance();
    // Mercurius registra también GET y QUERY: el `Allow` del 405 solo anuncia POST.
    if (fastify.restrictedMethods) restrictMethods(fastify, GRAPHQL_PATH, ['POST']);
    // GraphiQL (solo desarrollo) necesita scripts y estilos propios: se relaja la CSP `default-src 'none'` solo en su ruta.
    if (this.config.getOrThrow<AppConfig['environment']>('environment') !== 'production') {
      fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.url.startsWith('/graphiql')) {
          reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
        }
      });
    }
  }
}
