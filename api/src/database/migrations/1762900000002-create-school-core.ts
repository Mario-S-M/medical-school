import { MigrationInterface, QueryRunner } from 'typeorm';

// DDL del esquema `escuela` (SPEC 07): roles, categorías, perfiles, cursos, equipos de apoyo e invitaciones.
// Requiere la extensión unaccent en public (la crea un superusuario: plataforma.sql o create-platform-database.sh).
export class CreateSchoolCore1762900000002 implements MigrationInterface {
  name = 'CrearNucleoEscuela1762900000002';

  async up(q: QueryRunner): Promise<void> {
    const unaccent: unknown[] = await q.query(`SELECT 1 FROM pg_extension WHERE extname = 'unaccent'`);
    if (unaccent.length === 0) {
      throw new Error('Falta la extensión unaccent en plataforma: ejecuta api/scripts/create-platform-database.sh');
    }
    await q.query(`CREATE SCHEMA escuela`);
    await q.query(`CREATE FUNCTION escuela.sin_acentos(texto text) RETURNS text
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$`);

    await q.query(`CREATE TABLE escuela.roles_usuario (
      usuario_id uuid NOT NULL,
      rol text NOT NULL CHECK (rol IN ('instructor', 'equipo_apoyo', 'administrador')),
      asignado_por uuid,
      creado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, rol))`);

    await q.query(`CREATE TABLE escuela.perfiles_instructor (
      usuario_id uuid PRIMARY KEY,
      nombre_publico text NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now())`);

    await q.query(`CREATE TABLE escuela.categorias (
      id smallserial PRIMARY KEY,
      nombre text NOT NULL UNIQUE CHECK (length(nombre) BETWEEN 2 AND 60),
      slug text NOT NULL UNIQUE,
      posicion smallint NOT NULL)`);

    await q.query(`CREATE TABLE escuela.cursos (
      id bigserial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      instructor_id uuid NOT NULL,
      titulo text NOT NULL CHECK (length(titulo) BETWEEN 5 AND 120),
      subtitulo text CHECK (length(subtitulo) <= 200),
      descripcion text CHECK (length(descripcion) <= 5000),
      conocimientos_previos text CHECK (length(conocimientos_previos) <= 2000),
      lo_que_aprenderas text[] NOT NULL DEFAULT '{}' CHECK (cardinality(lo_que_aprenderas) <= 10),
      nivel text CHECK (nivel IN ('basico', 'intermedio', 'avanzado')),
      categoria_id smallint REFERENCES escuela.categorias (id),
      estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_revision', 'publicado')),
      comentario_revision text,
      portada_ruta text,
      publicado_en timestamptz,
      creado_en timestamptz NOT NULL DEFAULT now(),
      actualizado_en timestamptz NOT NULL DEFAULT now(),
      busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish', escuela.sin_acentos(
        coalesce(titulo, '') || ' ' || coalesce(subtitulo, '') || ' ' || coalesce(descripcion, '')))) STORED)`);
    await q.query(`CREATE INDEX cursos_busqueda_idx ON escuela.cursos USING gin (busqueda)`);
    await q.query(`CREATE INDEX cursos_estado_publicado_idx ON escuela.cursos (estado, publicado_en DESC)`);
    await q.query(`CREATE INDEX cursos_instructor_idx ON escuela.cursos (instructor_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA escuela CASCADE`);
  }
}
