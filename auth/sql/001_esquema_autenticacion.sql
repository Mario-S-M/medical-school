-- Esquema de autenticación en la base n8n (SPEC 04).
-- Aplicar con el rol de n8n; ver auth/README.md. Es idempotente.
CREATE SCHEMA IF NOT EXISTS autenticacion;

CREATE TABLE IF NOT EXISTS autenticacion.intentos_inicio_sesion (
  id         bigserial   PRIMARY KEY,
  correo     text        NOT NULL,  -- en minúsculas
  ip         inet        NOT NULL,
  exitoso    boolean     NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intentos_correo_creado_en_idx
  ON autenticacion.intentos_inicio_sesion (correo, creado_en DESC);
CREATE INDEX IF NOT EXISTS intentos_ip_creado_en_idx
  ON autenticacion.intentos_inicio_sesion (ip, creado_en DESC);

CREATE TABLE IF NOT EXISTS autenticacion.contrasenas_comunes (
  contrasena text PRIMARY KEY       -- en minúsculas
);
