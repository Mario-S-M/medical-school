-- Esquema de la escuela en la base n8n (SPEC 07).
-- Aplicar con el rol de n8n; ver escuela/README.md. Es idempotente.
-- Los usuarios se referencian por su uuid de Supabase Auth, sin clave foránea (auth.users vive en otra base).
CREATE SCHEMA IF NOT EXISTS escuela;

-- Envoltura inmutable de unaccent, necesaria para la columna generada y su índice
CREATE OR REPLACE FUNCTION escuela.sin_acentos(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

CREATE TABLE IF NOT EXISTS escuela.roles_usuario (
  usuario_id   uuid        NOT NULL,
  rol          text        NOT NULL CHECK (rol IN ('instructor', 'equipo_apoyo', 'administrador')),
  asignado_por uuid,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol)
);

-- Copia del nombre para buscar y mostrar sin cruzar bases
CREATE TABLE IF NOT EXISTS escuela.perfiles_instructor (
  usuario_id     uuid        PRIMARY KEY,
  nombre_publico text        NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escuela.categorias (
  id       smallserial PRIMARY KEY,
  nombre   text        NOT NULL UNIQUE CHECK (length(nombre) BETWEEN 2 AND 60),
  slug     text        NOT NULL UNIQUE,
  posicion smallint    NOT NULL
);

CREATE TABLE IF NOT EXISTS escuela.cursos (
  id                   bigserial   PRIMARY KEY,
  slug                 text        NOT NULL UNIQUE,
  instructor_id        uuid        NOT NULL,
  titulo               text        NOT NULL CHECK (length(titulo) BETWEEN 5 AND 120),
  subtitulo            text        CHECK (length(subtitulo) <= 200),
  descripcion          text        CHECK (length(descripcion) <= 5000),
  conocimientos_previos text       CHECK (length(conocimientos_previos) <= 2000),
  lo_que_aprenderas    text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(lo_que_aprenderas) <= 10),
  nivel                text        CHECK (nivel IN ('basico', 'intermedio', 'avanzado')),
  categoria_id         smallint    REFERENCES escuela.categorias,
  estado               text        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_revision', 'publicado')),
  comentario_revision  text,
  portada_ruta         text,
  publicado_en         timestamptz,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  busqueda             tsvector GENERATED ALWAYS AS (to_tsvector('spanish', escuela.sin_acentos(
    coalesce(titulo, '') || ' ' || coalesce(subtitulo, '') || ' ' || coalesce(descripcion, '')))) STORED
);
CREATE INDEX IF NOT EXISTS cursos_busqueda_idx ON escuela.cursos USING gin (busqueda);
CREATE INDEX IF NOT EXISTS cursos_instructor_idx ON escuela.cursos (instructor_id);
CREATE INDEX IF NOT EXISTS cursos_estado_publicado_idx ON escuela.cursos (estado, publicado_en DESC);

CREATE TABLE IF NOT EXISTS escuela.secciones (
  id       bigserial PRIMARY KEY,
  curso_id bigint    NOT NULL REFERENCES escuela.cursos ON DELETE CASCADE,
  titulo   text      NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
  posicion smallint  NOT NULL,
  UNIQUE (curso_id, posicion) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS escuela.clases (
  id                        bigserial PRIMARY KEY,
  seccion_id                bigint    NOT NULL REFERENCES escuela.secciones ON DELETE CASCADE,
  titulo                    text      NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
  descripcion               text      CHECK (length(descripcion) <= 2000),
  duracion_estimada_minutos smallint  CHECK (duracion_estimada_minutos BETWEEN 1 AND 180),
  es_muestra                boolean   NOT NULL DEFAULT false,
  posicion                  smallint  NOT NULL,
  UNIQUE (seccion_id, posicion) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS escuela.equipos_apoyo (
  instructor_id uuid        NOT NULL,
  miembro_id    uuid        NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instructor_id, miembro_id)
);

CREATE TABLE IF NOT EXISTS escuela.invitaciones_equipo (
  id            bigserial   PRIMARY KEY,
  instructor_id uuid        NOT NULL,
  miembro_id    uuid        NOT NULL,
  correo        text        NOT NULL,
  estado        text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  expira_en     timestamptz NOT NULL DEFAULT now() + interval '7 days',
  respondida_en timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_pendiente_unica
  ON escuela.invitaciones_equipo (instructor_id, miembro_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS invitaciones_miembro_idx ON escuela.invitaciones_equipo (miembro_id, estado);
