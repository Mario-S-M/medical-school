-- Extensiones de la escuela en la base n8n (SPEC 07).
-- Aplicar como superusuario (postgres); ver escuela/README.md. Es idempotente.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_bytes: la clave AES-128 de cada video (SPEC 08)
