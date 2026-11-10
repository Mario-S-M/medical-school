-- Videos de clase (SPEC 08): un registro por video subido y la clave AES-128 aparte.
-- Aplicar con el rol de n8n; ver escuela/README.md. Es idempotente.
CREATE TABLE IF NOT EXISTS escuela.videos_clase (
  id                bigserial   PRIMARY KEY,
  clase_id          bigint      NOT NULL REFERENCES escuela.clases ON DELETE CASCADE,
  estado            text        NOT NULL CHECK (estado IN ('esperando_archivo', 'en_cola', 'procesando', 'listo', 'error')),
  vigente           boolean     NOT NULL DEFAULT false,   -- el video que se sirve
  nombre_original   text        NOT NULL CHECK (length(nombre_original) BETWEEN 1 AND 255),
  tipo_contenido    text        NOT NULL CHECK (tipo_contenido IN ('video/mp4', 'video/quicktime', 'video/webm')),
  tamano_bytes      bigint      NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 1073741824),
  duracion_segundos integer     CHECK (duracion_segundos > 0),
  ruta_base         text        NOT NULL,                 -- cursos/<c>/secciones/<s>/clases/<k>/<id>
  error             text,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  listo_en          timestamptz
);
-- un solo video vigente por clase y uno solo en proceso
CREATE UNIQUE INDEX IF NOT EXISTS videos_vigente_unico ON escuela.videos_clase (clase_id) WHERE vigente;
CREATE UNIQUE INDEX IF NOT EXISTS videos_en_proceso_unico ON escuela.videos_clase (clase_id)
  WHERE estado IN ('esperando_archivo', 'en_cola', 'procesando');

-- La clave va en otra tabla para que ninguna consulta de la ficha o del editor la arrastre.
CREATE TABLE IF NOT EXISTS escuela.claves_video (
  video_id bigint PRIMARY KEY REFERENCES escuela.videos_clase ON DELETE CASCADE,
  clave    bytea  NOT NULL CHECK (octet_length(clave) = 16)   -- AES-128
);
