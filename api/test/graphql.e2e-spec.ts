import { readFileSync } from 'node:fs';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { SCHEMA_PATH } from '../src/modules/graphql/graphql.module';
import { persistedHash } from './helpers/manifest';
import { startGraphql, signToken } from './helpers/start-graphql';
import { newIp } from './helpers/real-env';

// GraphQL (SPEC 09, paso 5) con la app en proceso y una clave de prueba: los dos modos de NODE_ENV, sin tocar el stack.
// Las pruebas contra el contenedor real (login de verdad y producción) están en `graphql_real.e2e-spec.ts`.

const HASH_YO = persistedHash('yo').replace('sha256:', '');
const YO = '{ yo { id correo nombre } }';
const profunda = (n: number): string => `{ ${'a { '.repeat(n - 1)}a${' }'.repeat(n - 1)} }`;
const AHORA = Math.floor(Date.now() / 1000);

function cliente(app: NestFastifyApplication) {
  const ip = newIp();
  const consulta = (body: unknown, token?: string) => {
    const r = request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', ip);
    return (token ? r.set('Authorization', `Bearer ${token}`) : r).send(body as object);
  };
  const crudo = (method: 'get' | 'put' | 'delete' | 'post') => request(app.getHttpServer())[method]('/api/graphql').set('X-Forwarded-For', ip);
  return { ip, consulta, crudo };
}

describe('GraphQL en desarrollo (NODE_ENV=development)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await startGraphql('development');
  });
  afterAll(async () => {
    await app.close();
  });

  it('yo con un token válido devuelve { id, correo, nombre } del JWT', async () => {
    const r = await cliente(app).consulta({ query: YO }, signToken()).expect(200);
    expect(r.body).toEqual({ data: { yo: { id: '11111111-2222-4333-8444-555555555555', correo: 'ana@example.com', nombre: 'Ana Prueba' } } });
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('si el JWT no trae el nombre, yo lo devuelve vacío (el campo es obligatorio)', async () => {
    const r = await cliente(app).consulta({ query: YO }, signToken({ user_metadata: {} })).expect(200);
    expect(r.body.data.yo.nombre).toBe('');
  });

  describe('TOKEN_INVALIDO', () => {
    const cases: [string, () => string | undefined][] = [
      ['sin token', () => undefined],
      ['caducado', () => signToken({ exp: AHORA - 10 })],
      ['firmado con otra clave', () => signToken({}, 'otra-clave-otra-clave-otra-clave-otra')],
      ['con aud incorrecta', () => signToken({ aud: 'anon' })],
      ['con iss incorrecto', () => signToken({ iss: 'http://otro.prueba' })],
      ['que no es un JWT', () => 'esto-no-es-un-jwt'],
    ];
    it.each(cases)('%s', async (_nombre, token) => {
      const r = await cliente(app).consulta({ query: YO }, token()).expect(200);
      expect(r.body.data).toBeNull();
      expect(r.body.errors).toHaveLength(1);
      expect(r.body.errors[0].extensions).toEqual({ codigo: 'TOKEN_INVALIDO' });
      expect(JSON.stringify(r.body)).not.toMatch(/signature|jwt malformed|expired/i);
    });

    it('una cabecera Authorization sin Bearer', async () => {
      const { ip } = cliente(app);
      const r = await request(app.getHttpServer()).post('/api/graphql').set('X-Forwarded-For', ip).set('Authorization', signToken()).send({ query: YO });
      expect(r.body.errors[0].extensions.codigo).toBe('TOKEN_INVALIDO');
    });
  });

  describe('profundidad y costo', () => {
    it('profundidad 8 pasa la complejidad (falla después por campo desconocido) y la 9 da 400 CONSULTA_DEMASIADO_COMPLEJA', async () => {
      const c = cliente(app);
      expect((await c.consulta({ query: profunda(8) }, signToken()).expect(400)).body.error.codigo).toBe('SOLICITUD_INVALIDA');
      const r = await c.consulta({ query: profunda(9) }, signToken()).expect(400);
      expect(r.body.error.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
      expect(r.body.errors[0].extensions.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    });

    it('un costo mayor que 1000 (alias repetidos) da 400 CONSULTA_DEMASIADO_COMPLEJA', async () => {
      const campos = Array.from({ length: 501 }, (_, i) => `c${i}:yo{id}`).join(' ');
      const r = await cliente(app).consulta({ query: `{ ${campos} }` }, signToken()).expect(400);
      expect(r.body.error.codigo).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    });

    it('una consulta anidada cientos de veces da 400, nunca 500', async () => {
      const r = await cliente(app).consulta({ query: profunda(1500) }, signToken());
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toMatch(/^(SOLICITUD_INVALIDA|CONSULTA_DEMASIADO_COMPLEJA)$/);
    });

    it('la introspección propia de desarrollo (profunda) no se bloquea y GraphiQL responde', async () => {
      const c = cliente(app);
      const intro = '{ __schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } } } }';
      const r = await c.consulta({ query: intro }).expect(200);
      expect(r.body.data.__schema.types.length).toBeGreaterThan(3);
      const ide = await request(app.getHttpServer()).get('/graphiql').set('X-Forwarded-For', c.ip).expect(200);
      expect(ide.headers['content-type']).toMatch(/text\/html/);
    });
  });

  describe('método, tipo de contenido y tamaño', () => {
    it('GET da 405 con Allow: POST y el formato uniforme', async () => {
      const r = await cliente(app).crudo('get').query({ query: YO }).expect(405);
      expect(r.headers.allow).toBe('POST');
      expect(r.body.error).toEqual({ codigo: 'METODO_NO_PERMITIDO', mensaje: 'Método no permitido.' });
    });

    it('PUT y DELETE también dan 405 con Allow: POST', async () => {
      for (const m of ['put', 'delete'] as const) {
        const r = await cliente(app).crudo(m).expect(405);
        expect(r.headers.allow).toBe('POST');
      }
    });

    it('un POST con otro tipo de contenido o sin cuerpo da 415', async () => {
      const c = cliente(app);
      expect((await c.crudo('post').set('Content-Type', 'text/plain').send(YO).expect(415)).body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
      expect((await c.crudo('post').set('Content-Type', 'application/graphql').send(YO).expect(415)).body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
      expect((await c.crudo('post').set('Content-Type', 'application/x-www-form-urlencoded').send('query=x').expect(415)).body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
      expect((await c.crudo('post').expect(415)).body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
    });

    it('un cuerpo de más de 10 KB da 413 y un JSON roto 400 JSON_INVALIDO', async () => {
      const c = cliente(app);
      const grande = await c.consulta({ query: YO, variables: { relleno: 'x'.repeat(11 * 1024) } }).expect(413);
      expect(grande.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
      const broken = await c.crudo('post').set('Content-Type', 'application/json').send('{"query":').expect(400);
      expect(broken.body.error.codigo).toBe('JSON_INVALIDO');
    });

    it('rechaza lotes de consultas (arreglo)', async () => {
      const r = await cliente(app).consulta([{ query: YO }, { query: YO }], signToken()).expect(400);
      expect(r.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    });

    it('no usa cookies y lleva las cabeceras de seguridad', async () => {
      const r = await cliente(app).consulta({ query: YO }, signToken()).expect(200);
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(r.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('errores de validación', () => {
    it('devuelven el formato uniforme y sin "Did you mean"', async () => {
      const r = await cliente(app).consulta({ query: '{ yoo { idd } }' }, signToken()).expect(400);
      expect(r.body.error.codigo).toBe('SOLICITUD_INVALIDA');
      expect(JSON.stringify(r.body)).not.toMatch(/Did you mean/i);
      expect(r.body.error.detalles[0]).toEqual({ campo: 'consulta', regla: 'graphql', mensaje: expect.stringContaining('yoo') });
    });

    it('un error de sintaxis también, y un campo desconocido dentro de un tipo', async () => {
      const c = cliente(app);
      expect((await c.consulta({ query: '{ yo { ' }).expect(400)).body.error.codigo).toBe('SOLICITUD_INVALIDA');
      const r = await c.consulta({ query: '{ yo { idd } }' }).expect(400);
      expect(JSON.stringify(r.body)).not.toMatch(/Did you mean/i);
    });

    it('un cuerpo sin consulta ni hash da 400', async () => {
      expect((await cliente(app).consulta({}).expect(400)).body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
    });
  });

  describe('consultas persistidas en desarrollo', () => {
    it.each([
      ['documentId', { documentId: HASH_YO }],
      ['extensions.persistedQuery (urql)', { extensions: { persistedQuery: { version: 1, sha256Hash: HASH_YO } } }],
      ['query + persisted (Mercurius)', { query: HASH_YO, persisted: true }],
    ])('el hash de yo funciona con %s', async (_forma, body) => {
      const r = await cliente(app).consulta({ ...body, operationName: 'yo' }, signToken()).expect(200);
      expect(r.body.data.yo.nombre).toBe('Ana Prueba');
    });

    it('un hash desconocido da 400 CONSULTA_NO_PERMITIDA', async () => {
      const r = await cliente(app).consulta({ documentId: `sha256:${'c'.repeat(64)}` }, signToken()).expect(400);
      expect(r.body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
    });
  });

  it('escribe api/graphql/schema.graphql con yo: Usuario!', () => {
    const esquema = readFileSync(SCHEMA_PATH, 'utf8');
    expect(esquema).toContain('yo: Usuario!');
    expect(esquema).toMatch(/type Usuario \{\s+id: ID!\s+correo: String!\s+nombre: String!\s+\}/);
  });

  it('la petición 121 de una IP en un minuto da 429 con Retry-After (y otra IP no se ve afectada)', async () => {
    const c = cliente(app);
    for (let i = 0; i < 120; i++) await c.consulta({ query: YO }, signToken()).expect(200);
    const r = await c.consulta({ query: YO }, signToken()).expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    await cliente(app).consulta({ query: YO }, signToken()).expect(200);
  });
});

describe('GraphQL en producción (NODE_ENV=production)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await startGraphql('production');
  });
  afterAll(async () => {
    await app.close();
  });

  it('una consulta completa, también la de yo, da 400 CONSULTA_NO_PERMITIDA en el formato uniforme', async () => {
    const r = await cliente(app).consulta({ query: YO }, signToken()).expect(400);
    expect(r.body.error).toEqual({ codigo: 'CONSULTA_NO_PERMITIDA', mensaje: 'Esta consulta no está permitida.' });
  });

  it('un operationName desconocido en una consulta persistida da 400 SOLICITUD_INVALIDA, no 500', async () => {
    const r = await cliente(app).consulta({ documentId: HASH_YO, operationName: 'no_existe' }, signToken()).expect(400);
    expect(r.body.error).toEqual({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'Solicitud inválida.' });
    expect(r.body.errors).toEqual([{ message: 'Solicitud inválida.', extensions: { codigo: 'SOLICITUD_INVALIDA' } }]);
    expect(JSON.stringify(r.body)).not.toMatch(/no_existe|Unknown operation/);
  });

  it('la introspección falla (consulta completa o con el hash de otra consulta)', async () => {
    const c = cliente(app);
    expect((await c.consulta({ query: '{ __schema { queryType { name } } }' }, signToken()).expect(400)).body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
    expect((await c.consulta({ query: '{ __type(name: "Usuario") { name } }' }).expect(400)).body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
  });

  it('NoSchemaIntrospectionCustomRule está activa aunque alguien persistiera una consulta de introspección', async () => {
    const fastify = app.getHttpAdapter().getInstance() as unknown as { graphql: (q: string) => Promise<unknown> };
    await expect(fastify.graphql('{ __schema { queryType { name } } }')).rejects.toMatchObject({ code: 'MER_ERR_GQL_VALIDATION' });
  });

  it('GET /graphiql da 404', async () => {
    const r = await request(app.getHttpServer()).get('/graphiql').set('X-Forwarded-For', newIp()).expect(404);
    expect(r.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it.each([
    ['documentId', { documentId: `sha256:${HASH_YO}` }],
    ['extensions.persistedQuery (urql)', { extensions: { persistedQuery: { version: 1, sha256Hash: `sha256:${HASH_YO}` } } }],
    ['query + persisted (Mercurius)', { query: HASH_YO, persisted: true }],
  ])('el hash de yo funciona con %s', async (_forma, body) => {
    const r = await cliente(app).consulta(body, signToken()).expect(200);
    expect(r.body.data.yo).toEqual({ id: '11111111-2222-4333-8444-555555555555', correo: 'ana@example.com', nombre: 'Ana Prueba' });
  });

  it('un hash desconocido, __proto__ o una consulta completa con un hash válido dan 400 CONSULTA_NO_PERMITIDA', async () => {
    const c = cliente(app);
    for (const body of [
      { query: 'd'.repeat(64), persisted: true },
      { query: '__proto__', persisted: true },
      { documentId: 'constructor' },
      { query: '{ yo { id } }', extensions: { persistedQuery: { version: 1, sha256Hash: HASH_YO } } },
    ]) {
      expect((await c.consulta(body, signToken()).expect(400)).body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
    }
  });

  it('el hash de yo sin token válido da TOKEN_INVALIDO', async () => {
    const r = await cliente(app).consulta({ documentId: HASH_YO }, signToken({ exp: AHORA - 5 })).expect(200);
    expect(r.body.errors[0].extensions.codigo).toBe('TOKEN_INVALIDO');
  });

  it('GET da 405 y un POST sin JSON da 415 también en producción', async () => {
    const c = cliente(app);
    await c.crudo('get').expect(405);
    await c.crudo('post').set('Content-Type', 'text/plain').send('x').expect(415);
  });
});
