-- Límites de solicitud y de errores de código (verificación de correo y recuperación de contraseña, SPEC 05).
-- Aplicar con el rol de n8n; ver auth/README.md. Es idempotente.
CREATE TABLE IF NOT EXISTS autenticacion.eventos_codigo (
  id         bigserial   PRIMARY KEY,
  proposito  text        NOT NULL CHECK (proposito IN ('verificacion', 'recuperacion')),
  tipo       text        NOT NULL CHECK (tipo IN ('solicitud', 'error')),
  correo     text        NOT NULL,  -- en minúsculas
  ip         inet        NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_codigo_correo_idx
  ON autenticacion.eventos_codigo (correo, proposito, tipo, creado_en DESC);
CREATE INDEX IF NOT EXISTS eventos_codigo_ip_idx
  ON autenticacion.eventos_codigo (ip, tipo, creado_en DESC);
