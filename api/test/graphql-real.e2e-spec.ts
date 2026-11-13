import { persistedHash } from './helpers/manifest';
import { signToken } from './helpers/start-graphql';
import { createUser, http, newIp, signIn, cleanup } from './helpers/real-env';

// GraphQL contra el contenedor `api` real (NODE_ENV=production): login de verdad con un usuario de prueba verificado.
// Las claves del contenedor no se conocen aquí, así que los tokens "malos" se firman con una clave de prueba.

const CLAVE_YO = persistedHash('yo');
const YO = '{ yo { id correo nombre } }';
const AHORA = Math.floor(Date.now() / 1000);

const graphql = (ip: string) => http().post('/api/graphql').set('X-Forwarded-For', ip);
const conToken = (ip: string, token: string) => graphql(ip).set('Authorization', `Bearer ${token}`);

beforeAll(() => cleanup());
afterAll(() => cleanup());

describe('POST /api/graphql contra el contenedor (producción)', () => {
  it('con un token real, el hash de yo devuelve { id, correo, nombre } igual que antes lo hacía /autenticacion/yo', async () => {
    const person = await createUser(true);
    const session = await signIn(person, person.contrasena).expect(200);
    const token = session.body.token_acceso as string;

    const r = await conToken(person.ip, token).send({ extensions: { persistedQuery: { version: 1, sha256Hash: CLAVE_YO } }, operationName: 'yo' }).expect(200);
    expect(r.body).toEqual({ data: { yo: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), correo: person.correo, nombre: 'Prueba e2e' } } });
    expect(r.headers['set-cookie']).toBeUndefined();

    // lo que valida el JWT es lo que devolvía Supabase Auth con GET /user
    const mismoId = await conToken(person.ip, token).send({ documentId: CLAVE_YO }).expect(200);
    expect(mismoId.body.data.yo.id).toBe(r.body.data.yo.id);
  });

  it('sin token, con token caducado o firmado con otra clave: TOKEN_INVALIDO', async () => {
    const ip = newIp();
    const sinToken = await graphql(ip).send({ documentId: CLAVE_YO }).expect(200);
    expect(sinToken.body.errors[0].extensions.codigo).toBe('TOKEN_INVALIDO');
    for (const token of [signToken({ exp: AHORA - 10 }), signToken({}, 'otra-clave-otra-clave-otra-clave')]) {
      const r = await conToken(ip, token).send({ documentId: CLAVE_YO }).expect(200);
      expect(r.body).toMatchObject({ data: null, errors: [{ extensions: { codigo: 'TOKEN_INVALIDO' } }] });
    }
  });

  it('producción: una consulta completa o un hash desconocido dan 400 CONSULTA_NO_PERMITIDA', async () => {
    const ip = newIp();
    for (const body of [{ query: YO }, { documentId: `sha256:${'e'.repeat(64)}` }, { query: '{ __schema { queryType { name } } }' }]) {
      const r = await graphql(ip).send(body).expect(400);
      expect(r.body.error.codigo).toBe('CONSULTA_NO_PERMITIDA');
    }
  });

  it('producción: una operación persistida sin su variable obligatoria, o con un operationName desconocido, da 400 SOLICITUD_INVALIDA (nunca 500)', async () => {
    const person = await createUser(true);
    const token = (await signIn(person, person.contrasena).expect(200)).body.token_acceso as string;
    const cases: object[] = [
      { documentId: persistedHash('asignar_rol') }, // falta $activo, $rol y $usuario_id
      { documentId: persistedHash('asignar_rol'), variables: { rol: 'instructor', usuario_id: '00000000-0000-4000-8000-000000000000' } }, // falta $activo
      { documentId: CLAVE_YO, operationName: 'no_existe' },
    ];
    for (const body of cases) {
      const r = await conToken(person.ip, token).send(body).expect(400);
      expect(r.body.error).toEqual({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'Solicitud inválida.' });
      expect(JSON.stringify(r.body)).not.toMatch(/activo|Variable|Unknown operation|at \w+/);
    }
  });

  it('producción: GET /graphiql da 404, GET /api/graphql da 405 y sin JSON da 415', async () => {
    const ip = newIp();
    expect((await http().get('/graphiql').set('X-Forwarded-For', ip).expect(404)).body.error.codigo).toBe('NO_ENCONTRADO');
    const get = await http().get('/api/graphql').set('X-Forwarded-For', ip).expect(405);
    expect(get.headers.allow).toBe('POST');
    expect((await graphql(ip).set('Content-Type', 'text/plain').send(YO).expect(415)).body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
  });

  it('un cuerpo de más de 10 KB da 413', async () => {
    const r = await graphql(newIp()).send({ documentId: CLAVE_YO, variables: { relleno: 'x'.repeat(11 * 1024) } }).expect(413);
    expect(r.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });

  it('la petición 121 de una IP en un minuto da 429 con Retry-After', async () => {
    const ip = newIp();
    for (let i = 0; i < 120; i++) await graphql(ip).send({ documentId: CLAVE_YO }).expect(200);
    const r = await graphql(ip).send({ documentId: CLAVE_YO }).expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });
});
