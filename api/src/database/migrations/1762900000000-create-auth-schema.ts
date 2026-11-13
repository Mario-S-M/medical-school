import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSchema1762900000000 implements MigrationInterface {
  // Nombre ya registrado en la tabla `migrations` de TypeORM: no se puede cambiar o se volvería a ejecutar.
  name = 'CrearEsquemaAutenticacion1762900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA autenticacion`);
    await q.query(`CREATE TABLE autenticacion.intentos_inicio_sesion (
      id bigserial PRIMARY KEY, correo text NOT NULL, ip inet NOT NULL,
      exitoso boolean NOT NULL, creado_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX intentos_correo_creado_en_idx ON autenticacion.intentos_inicio_sesion (correo, creado_en DESC)`);
    await q.query(`CREATE INDEX intentos_ip_creado_en_idx ON autenticacion.intentos_inicio_sesion (ip, creado_en DESC)`);
    await q.query(`CREATE TABLE autenticacion.contrasenas_comunes (contrasena text PRIMARY KEY)`);
    await q.query(`CREATE TABLE autenticacion.eventos_codigo (
      id bigserial PRIMARY KEY,
      proposito text NOT NULL CHECK (proposito IN ('verificacion', 'recuperacion')),
      tipo text NOT NULL CHECK (tipo IN ('solicitud', 'error')),
      correo text NOT NULL, ip inet NOT NULL, creado_en timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX eventos_codigo_correo_idx ON autenticacion.eventos_codigo (correo, proposito, tipo, creado_en DESC)`);
    await q.query(`CREATE INDEX eventos_codigo_ip_idx ON autenticacion.eventos_codigo (ip, tipo, creado_en DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA autenticacion CASCADE`);
  }
}
