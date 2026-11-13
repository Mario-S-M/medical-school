import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { startApp, OPTIONS, FRONT_ORIGIN } from './helpers/start-app';

describe('Capa transversal', () => {
  let app: NestFastifyApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('cabeceras de seguridad y sin Server ni X-Powered-By', async () => {
    const r = await http().get('/prueba/ip').expect(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(r.headers['server']).toBeUndefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('404 NO_ENCONTRADO con formato uniforme', async () => {
    const r = await http().get('/no/existe').expect(404);
    expect(r.body).toEqual({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado.' } });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('405 con Allow', async () => {
    const r = await http().put('/prueba/eco').send({}).expect(405);
    expect(r.body.error.codigo).toBe('METODO_NO_PERMITIDO');
    expect(r.headers['allow']).toBe('POST, DELETE');
    const g = await http().post('/prueba/ip').send({}).expect(405);
    expect(g.headers['allow']).toContain('GET');
  });

  it('415 si POST o DELETE llevan un cuerpo que no es JSON', async () => {
    const p = await http().post('/prueba/eco').set('Content-Type', 'text/plain').send('hola').expect(415);
    expect(p.body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
    const d = await http().delete('/prueba/eco').set('Content-Type', 'text/plain').send('hola').expect(415);
    expect(d.body.error.codigo).toBe('TIPO_CONTENIDO_NO_SOPORTADO');
    await http().delete('/prueba/eco').expect(200);
  });

  it('413 por encima de 10 KB', async () => {
    const r = await http().post('/prueba/eco').send({ nombre: 'x'.repeat(11 * 1024) }).expect(413);
    expect(r.body).toEqual({
      error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo supera el tamaño máximo permitido.' },
    });
  });

  it('400 JSON_INVALIDO con JSON roto o vacío', async () => {
    const broken = await http().post('/prueba/eco').set('Content-Type', 'application/json').send('{"nombre":').expect(400);
    expect(broken.body.error.codigo).toBe('JSON_INVALIDO');
    const empty = await http().post('/prueba/eco').set('Content-Type', 'application/json').send('').expect(400);
    expect(empty.body.error.codigo).toBe('JSON_INVALIDO');
  });

  it('422 VALIDACION_FALLIDA con detalles, campos extra y tipos incorrectos', async () => {
    const extra = await http().post('/prueba/eco').send({ nombre: 'ana', rol: 'admin' }).expect(422);
    expect(extra.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect(extra.body.error.detalles).toEqual([
      { campo: 'rol', regla: 'campo_no_permitido', mensaje: 'Este campo no está permitido.' },
    ]);
    const falta = await http().post('/prueba/eco').send({}).expect(422);
    expect(falta.body.error.detalles.map((d: { campo: string; regla: string }) => d.regla).sort()).toEqual([
      'debe_ser_texto',
      'longitud_maxima',
      'obligatorio',
    ].sort());
    const largo = await http().post('/prueba/eco').send({ nombre: 'demasiado' }).expect(422);
    expect(largo.body.error.detalles).toEqual([{ campo: 'nombre', regla: 'longitud_maxima', mensaje: 'Máximo 5 caracteres.' }]);
    const array = await http().post('/prueba/eco').send([1]).expect(422);
    expect(array.body.error.detalles[0].campo).toBe('cuerpo');
    await http().post('/prueba/eco').send({ nombre: 'ana' }).expect(201);
  });

  it('500 ERROR_INTERNO sin filtrar detalles internos', async () => {
    const r = await http().get('/prueba/fallo').expect(500);
    expect(r.body).toEqual({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' } });
    expect(JSON.stringify(r.body)).not.toContain('secreto');
  });

  describe('CORS', () => {
    it('Origin permitido: cabeceras con credenciales', async () => {
      const r = await http().get('/prueba/ip').set('Origin', FRONT_ORIGIN).expect(200);
      expect(r.headers['access-control-allow-origin']).toBe(FRONT_ORIGIN);
      expect(r.headers['access-control-allow-credentials']).toBe('true');
      expect(r.headers['access-control-expose-headers']).toBe('Retry-After');
      expect(r.headers['vary']).toContain('Origin');
    });
    it('preflight con Origin permitido', async () => {
      const r = await http().options('/prueba/eco').set('Origin', FRONT_ORIGIN).expect(204);
      expect(r.headers['access-control-allow-headers']).toBe('Content-Type, Authorization, X-Solicitado-Con');
      expect(r.headers['access-control-allow-methods']).toContain('POST');
      expect(r.headers['access-control-max-age']).toBe('600');
      expect(r.headers['access-control-allow-origin']).toBe(FRONT_ORIGIN);
    });
    it('Origin ajeno: 403 ORIGEN_NO_PERMITIDO, también en preflight, sin cabeceras CORS', async () => {
      for (const method of ['get', 'options', 'post'] as const) {
        const r = await http()[method]('/prueba/ip').set('Origin', 'http://malo.example').expect(403);
        expect(r.body.error.codigo).toBe('ORIGEN_NO_PERMITIDO');
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
      }
    });
  });

  describe('IP del cliente', () => {
    it('lee X-Forwarded-For si el pariente directo es de confianza', async () => {
      // supertest llega desde 127.0.0.1 (loopback, de confianza)
      const r = await http().get('/prueba/ip').set('X-Forwarded-For', '203.0.113.9').expect(200);
      expect(r.body.ip).toBe('203.0.113.9');
    });
    it('ignora X-Forwarded-For si el pariente directo no es de confianza', async () => {
      const otra = await startApp({ ...OPTIONS, trustedProxies: ['10.0.0.0/8'] });
      const r = await request(otra.getHttpServer()).get('/prueba/ip').set('X-Forwarded-For', '203.0.113.9').expect(200);
      expect(r.body.ip).toBe('127.0.0.1');
      await otra.close();
    });
  });
});
