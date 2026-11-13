import { MigrationInterface, QueryRunner } from 'typeorm';

// DDL de los videos (SPEC 08): videos por clase y su clave AES-128 (tabla aparte, nunca sale por la API).
export class CreateVideos1762900000005 implements MigrationInterface {
  name = 'CrearVideos1762900000005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE escuela.videos_clase (
      id bigserial PRIMARY KEY,
      clase_id bigint NOT NULL REFERENCES escuela.clases (id) ON DELETE CASCADE,
      estado text NOT NULL CHECK (estado IN ('esperando_archivo', 'en_cola', 'procesando', 'listo', 'error')),
      vigente boolean NOT NULL DEFAULT false,
      nombre_original text NOT NULL CHECK (length(nombre_original) BETWEEN 1 AND 255),
      tipo_contenido text NOT NULL CHECK (tipo_contenido IN ('video/mp4', 'video/quicktime', 'video/webm')),
      tamano_bytes bigint NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 1073741824),
      duracion_segundos integer CHECK (duracion_segundos > 0),
      ruta_base text NOT NULL,
      error text,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      listo_en timestamptz)`);
    await q.query(`CREATE UNIQUE INDEX videos_vigente_unico ON escuela.videos_clase (clase_id) WHERE vigente`);
    await q.query(`CREATE UNIQUE INDEX videos_en_proceso_unico ON escuela.videos_clase (clase_id)
      WHERE estado IN ('esperando_archivo', 'en_cola', 'procesando')`);

    await q.query(`CREATE TABLE escuela.claves_video (
      video_id bigint PRIMARY KEY REFERENCES escuela.videos_clase (id) ON DELETE CASCADE,
      clave bytea NOT NULL CHECK (octet_length(clave) = 16))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE escuela.claves_video`);
    await q.query(`DROP TABLE escuela.videos_clase`);
  }
}
