#!/usr/bin/env bash
# Se conecta como supabase_admin (el "postgres" de Supabase no puede asignar dueños).
# Crea el rol, la base "plataforma" y su extensión unaccent en el Postgres de Supabase (contenedor db) cuando el volumen ya
# estaba inicializado. Es idempotente: se puede ejecutar varias veces. Lee solo dos variables del .env raíz, sin imprimirlas.
# Uso, desde cualquier carpeta:  api/scripts/create-platform-database.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"
# No se hace "source" del .env (no es válido para el shell): se leen solo las dos variables necesarias.
leer_variable() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2-; }
USUARIO_BD_PLATAFORMA="$(leer_variable USUARIO_BD_PLATAFORMA)"
CONTRASENA_BD_PLATAFORMA="$(leer_variable CONTRASENA_BD_PLATAFORMA)"
export USUARIO_BD_PLATAFORMA CONTRASENA_BD_PLATAFORMA
: "${USUARIO_BD_PLATAFORMA:?Falta USUARIO_BD_PLATAFORMA en el .env}"
: "${CONTRASENA_BD_PLATAFORMA:?Falta CONTRASENA_BD_PLATAFORMA en el .env}"

# Las variables viajan por el entorno del cliente (no por la línea de comandos) y psql las lee con \getenv.
docker compose exec -T \
  -e USUARIO_BD_PLATAFORMA -e CONTRASENA_BD_PLATAFORMA \
  db psql -h localhost -U supabase_admin -v ON_ERROR_STOP=1 <<'SQL'
\getenv usuario_plataforma USUARIO_BD_PLATAFORMA
\getenv contrasena_plataforma CONTRASENA_BD_PLATAFORMA

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'usuario_plataforma') AS crear_rol \gset
\if :crear_rol
  CREATE ROLE :"usuario_plataforma" LOGIN PASSWORD :'contrasena_plataforma' NOSUPERUSER NOCREATEDB NOCREATEROLE;
\else
  ALTER ROLE :"usuario_plataforma" LOGIN PASSWORD :'contrasena_plataforma';
\endif

SELECT NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'plataforma') AS crear_base \gset
\if :crear_base
  CREATE DATABASE plataforma OWNER :"usuario_plataforma";
\else
  ALTER DATABASE plataforma OWNER TO :"usuario_plataforma";
\endif

-- unaccent (SPEC 10): requiere superusuario, por eso no va en las migraciones.
\connect plataforma
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
echo "Base plataforma lista."
