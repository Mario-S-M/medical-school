import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { startApp } from './helpers/start-app';

describe('Límite general de peticiones', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('la petición 121 de una IP en un minuto da 429 con Retry-After; otra IP no se ve afectada', async () => {
    const http = () => request(app.getHttpServer());
    for (let i = 0; i < 120; i++) await http().get('/prueba/ip').set('X-Forwarded-For', '198.51.100.1').expect(200);
    const r = await http().get('/prueba/ip').set('X-Forwarded-For', '198.51.100.1').expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADAS_SOLICITUDES');
    expect(r.body.error.reintentar_en_segundos).toBeGreaterThan(0);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    await http().get('/prueba/ip').set('X-Forwarded-For', '198.51.100.2').expect(200);
  });
});
