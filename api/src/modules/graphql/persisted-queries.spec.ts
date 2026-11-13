import { readFileSync } from 'node:fs';
import { print, parse } from 'graphql';
import { ApiException } from '../../common/utils/api-exception';
import { MANIFEST_PATH, loadManifest, classifyRequest, hashOfQuery, normalizeHash, verifyManifest } from './persisted-queries';
import { createProtections } from './protections';

const HASH = 'a'.repeat(64);

describe('manifiesto api/graphql/consultas_persistidas.json', () => {
  it('cada hash es el sha256 de su consulta (npm run graphql:verificar)', () => {
    expect(verifyManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')))).toEqual([]);
  });

  it('incluye la consulta yo y todas las operaciones del front, impresas como las imprime el codegen (sin importar los espacios)', () => {
    const queries = Object.values(loadManifest());
    expect(queries.length).toBeGreaterThanOrEqual(33); // 12 consultas y 21 mutaciones de la escuela y la sesión
    // El codegen imprime el documento en una sola línea; `print` lo da en varias: se comparan sin espacios sobrantes.
    const unaLinea = (texto: string): string => texto.replace(/\s+/g, ' ').trim();
    for (const query of queries) expect(unaLinea(query)).toBe(unaLinea(print(parse(query))));
    expect(queries.some((query) => query.includes('query yo {'))).toBe(true);
  });

  it('detecta un hash que no corresponde, una clave mal formada y GraphQL roto', () => {
    expect(verifyManifest({ [`sha256:${HASH}`]: 'query a { a }' })).toHaveLength(1);
    expect(verifyManifest({ corto: 'query a { a }' })).toHaveLength(1);
    const q = 'query a {';
    expect(verifyManifest({ [hashOfQuery(q)]: q })).toHaveLength(1);
    expect(verifyManifest([])).toHaveLength(1);
  });

  it('acepta la clave con o sin el prefijo sha256:', () => {
    const q = 'query a { a }';
    expect(verifyManifest({ [`sha256:${hashOfQuery(q)}`]: q, [hashOfQuery(q)]: q })).toEqual([]);
  });
});

describe('normalizarHash y clasificarSolicitud', () => {
  it('solo acepta 64 hexadecimales en minúscula, con prefijo opcional', () => {
    expect(normalizeHash(`sha256:${HASH}`)).toBe(HASH);
    expect(normalizeHash(HASH)).toBe(HASH);
    for (const malo of ['__proto__', 'constructor', HASH.toUpperCase(), `${HASH}0`, 7, null, undefined]) expect(normalizeHash(malo)).toBeNull();
  });

  it('reconoce las tres formas de pedir una consulta persistida', () => {
    const esperado = { kind: 'persisted', hash: HASH };
    expect(classifyRequest({ documentId: `sha256:${HASH}` })).toEqual(esperado);
    expect(classifyRequest({ extensions: { persistedQuery: { version: 1, sha256Hash: `sha256:${HASH}` } } })).toEqual(esperado);
    expect(classifyRequest({ query: HASH, persisted: true })).toEqual(esperado);
  });

  it('una consulta con texto es completa aunque traiga un hash (no se cuela una consulta con un hash válido)', () => {
    expect(classifyRequest({ query: '{ yo { id } }' })).toEqual({ kind: 'full' });
    expect(classifyRequest({ query: '{ yo { id } }', extensions: { persistedQuery: { version: 1, sha256Hash: HASH } } })).toEqual({ kind: 'full' });
    expect(classifyRequest({ query: HASH })).toEqual({ kind: 'full' }); // sin `persisted: true`
    expect(classifyRequest({ query: HASH, persisted: true, documentId: HASH })).toEqual({ kind: 'full' });
  });

  it('sin consulta ni hash válido queda como persistida sin hash (se rechaza)', () => {
    expect(classifyRequest({})).toEqual({ kind: 'persisted', hash: null });
    expect(classifyRequest({ extensions: { persistedQuery: { version: 2, sha256Hash: HASH } } })).toEqual({ kind: 'persisted', hash: null });
  });
});

describe('lista blanca de consultas persistidas (hook de la ruta)', () => {
  const manifest = Object.assign(Object.create(null), { [HASH]: 'query a { a }' }) as Record<string, string>;
  const storage = { increment: jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) };
  const hook = (production: boolean) => createProtections({ production, limitStorage: storage, manifest, limit: 120, windowMs: 60_000 });
  const request = (body: unknown, extra: Record<string, unknown> = {}) =>
    ({ method: 'POST', ip: '198.51.100.7', headers: { 'content-type': 'application/json' }, body: body, ...extra }) as never;
  const code = async (promise: Promise<void>): Promise<string | undefined> => promise.then(() => undefined, (e: ApiException) => `${e.getStatus()} ${e.code}`);

  it('en producción una consulta completa da 400 CONSULTA_NO_PERMITIDA', async () => {
    expect(await code(hook(true)(request({ query: '{ yo { id } }' })))).toBe('400 CONSULTA_NO_PERMITIDA');
  });

  it('un hash desconocido, mal formado o __proto__ da 400 CONSULTA_NO_PERMITIDA (también en desarrollo)', async () => {
    for (const production of [true, false]) {
      for (const hash of ['b'.repeat(64), '__proto__', 'constructor']) {
        expect(await code(hook(production)(request({ query: hash, persisted: true })))).toBe('400 CONSULTA_NO_PERMITIDA');
      }
    }
  });

  it('un hash del manifiesto pasa y se reduce a la forma de Mercurius, conservando variables y operationName', async () => {
    const p = request({ extensions: { persistedQuery: { version: 1, sha256Hash: `sha256:${HASH}` } }, variables: { x: 1 }, operationName: 'a' });
    expect(await code(hook(true)(p))).toBeUndefined();
    expect((p as { body: unknown }).body).toEqual({ query: HASH, persisted: true, variables: { x: 1 }, operationName: 'a' });
  });

  it('en desarrollo una consulta completa pasa sin tocarse', async () => {
    const body = { query: '{ yo { id } }' };
    const p = request(body);
    expect(await code(hook(false)(p))).toBeUndefined();
    expect((p as { body: unknown }).body).toBe(body);
  });

  it('rechaza lotes (arreglos), cuerpos que no son objeto, otros métodos y otro tipo de contenido', async () => {
    expect(await code(hook(false)(request([{ query: '{ a }' }])))).toBe('400 SOLICITUD_INVALIDA');
    expect(await code(hook(false)(request('texto')))).toBe('400 SOLICITUD_INVALIDA');
    expect(await code(hook(false)(request(undefined)))).toBe('400 SOLICITUD_INVALIDA');
    expect(await code(hook(false)(request({}, { method: 'GET' })))).toBe('405 METODO_NO_PERMITIDO');
    expect(await code(hook(false)(request({}, { method: 'QUERY' })))).toBe('405 METODO_NO_PERMITIDO');
    expect(await code(hook(false)(request({}, { headers: { 'content-type': 'text/plain' } })))).toBe('415 TIPO_CONTENIDO_NO_SOPORTADO');
    expect(await code(hook(false)(request({}, { headers: {} })))).toBe('415 TIPO_CONTENIDO_NO_SOPORTADO');
  });

  it('cuenta cada petición por IP y da 429 con Retry-After al bloquearse', async () => {
    storage.increment.mockResolvedValueOnce({ totalHits: 121, timeToExpire: 30, isBlocked: true, timeToBlockExpire: 30 });
    const error = await hook(false)(request({ query: '{ a }' })).catch((e: ApiException) => e);
    expect(error).toMatchObject({ code: 'DEMASIADAS_SOLICITUDES', headers: { 'Retry-After': '30' } });
    expect(storage.increment).toHaveBeenLastCalledWith('graphql-198.51.100.7', 60_000, 120, 60_000, 'graphql');
  });
});
