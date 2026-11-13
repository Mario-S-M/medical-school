import { readConfig } from './configuration';

const base = { USUARIO_BD_PLATAFORMA: 'u', CONTRASENA_BD_PLATAFORMA: 'c', ORIGEN_FRONT: 'http://localhost:4321', JWT_SECRET: 'j', API_EXTERNAL_URL: 'http://localhost:8000', SERVICE_ROLE_KEY: 'k', SECRETO_TRANSCODIFICADOR: 't' };

describe('readConfig', () => {
  it('usa los valores por defecto', () => {
    const c = readConfig(base);
    expect(c.port).toBe(3000);
    expect(c.frontOrigin).toBe('http://localhost:4321');
    expect(c.trustedProxies).toEqual(['loopback', '172.16.0.0/12', '192.168.0.0/16']);
    expect(c.db).toMatchObject({ host: 'db', port: 5432, name: 'plataforma' });
    expect(c.auth).toEqual({ url: 'http://auth:9999', timeoutMs: 8000, serviceKey: 'k' });
    expect(c.storage).toEqual({ url: 'http://storage:5000', timeoutMs: 15000 });
    expect(c.transcoder).toEqual({ url: 'http://transcodificador:8090', secret: 't', timeoutMs: 10000 });
    expect(c.mail).toEqual({ host: 'mailpit', port: 1025 });
    expect(c.jwt).toEqual({ secret: 'j', issuer: 'http://localhost:8000' });
  });
  it('falla si falta JWT_SECRET o API_EXTERNAL_URL', () => {
    expect(() => readConfig({ ...base, JWT_SECRET: undefined })).toThrow('JWT_SECRET');
    expect(() => readConfig({ ...base, API_EXTERNAL_URL: undefined })).toThrow('API_EXTERNAL_URL');
  });
  it('falla si falta SERVICE_ROLE_KEY', () => {
    expect(() => readConfig({ ...base, SERVICE_ROLE_KEY: undefined })).toThrow('SERVICE_ROLE_KEY');
  });
  it('falla si falta SECRETO_TRANSCODIFICADOR y valida URL_TRANSCODIFICADOR', () => {
    expect(() => readConfig({ ...base, SECRETO_TRANSCODIFICADOR: undefined })).toThrow('SECRETO_TRANSCODIFICADOR');
    expect(readConfig({ ...base, URL_TRANSCODIFICADOR: 'http://127.0.0.1:9000/' }).transcoder.url).toBe('http://127.0.0.1:9000');
    expect(() => readConfig({ ...base, URL_TRANSCODIFICADOR: 'transcodificador:8090' })).toThrow('URL_TRANSCODIFICADOR');
    expect(() => readConfig({ ...base, URL_TRANSCODIFICADOR: 'file:///etc/passwd' })).toThrow('URL_TRANSCODIFICADOR');
  });
  it('falla si falta el usuario de la base', () => {
    expect(() => readConfig({ CONTRASENA_BD_PLATAFORMA: 'c', ORIGEN_FRONT: 'http://localhost:4321', JWT_SECRET: 'j', API_EXTERNAL_URL: 'x', SERVICE_ROLE_KEY: 'k', SECRETO_TRANSCODIFICADOR: 't' })).toThrow('USUARIO_BD_PLATAFORMA');
  });
  it('falla si falta ORIGEN_FRONT', () => {
    expect(() => readConfig({ USUARIO_BD_PLATAFORMA: 'u', CONTRASENA_BD_PLATAFORMA: 'c', JWT_SECRET: 'j', API_EXTERNAL_URL: 'x', SERVICE_ROLE_KEY: 'k', SECRETO_TRANSCODIFICADOR: 't' })).toThrow('ORIGEN_FRONT');
  });
  it('lee y valida URL_STORAGE, SMTP_HOST y SMTP_PORT', () => {
    expect(readConfig({ ...base, URL_STORAGE: 'http://127.0.0.1:8000/storage/v1/' }).storage.url).toBe('http://127.0.0.1:8000/storage/v1');
    expect(readConfig({ ...base, SMTP_HOST: 'correo', SMTP_PORT: '2525' }).mail).toEqual({ host: 'correo', port: 2525 });
    expect(() => readConfig({ ...base, URL_STORAGE: 'storage:5000' })).toThrow('URL_STORAGE');
    expect(() => readConfig({ ...base, URL_STORAGE: 'ftp://storage' })).toThrow('URL_STORAGE');
    expect(() => readConfig({ ...base, SMTP_PORT: '0' })).toThrow('SMTP_PORT');
  });
  it('SEGUNDOS_AUTORIZACION_REPRODUCCION vale 600 por defecto y acepta de 60 a 3600', () => {
    expect(readConfig(base).playback).toEqual({ authorizationSeconds: 600 });
    expect(readConfig({ ...base, SEGUNDOS_AUTORIZACION_REPRODUCCION: '60' }).playback.authorizationSeconds).toBe(60);
    expect(readConfig({ ...base, SEGUNDOS_AUTORIZACION_REPRODUCCION: '3600' }).playback.authorizationSeconds).toBe(3600);
    for (const value of ['59', '3601', '1.5', 'abc', '-1']) {
      expect(() => readConfig({ ...base, SEGUNDOS_AUTORIZACION_REPRODUCCION: value })).toThrow('SEGUNDOS_AUTORIZACION_REPRODUCCION');
    }
  });
  it('falla con un puerto o un entorno inválido', () => {
    expect(() => readConfig({ ...base, PUERTO: 'abc' })).toThrow('PUERTO');
    expect(() => readConfig({ ...base, NODE_ENV: 'otro' })).toThrow('NODE_ENV');
  });
});
