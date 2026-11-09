#!/usr/bin/env bash
# Da el rol administrador a un usuario ya registrado (SPEC 07). Desde la raíz del repo:
#   bash escuela/scripts/crear_administrador.sh correo@ejemplo.com
# Busca el uuid en auth.users (base postgres) e inserta el rol en escuela.roles_usuario (base n8n).
set -euo pipefail

correo="${1:-}"
if [[ ! "$correo" =~ ^[^[:space:]\'\"\;\\]+@[^[:space:]\'\"\;\\]+$ ]]; then
  echo "Uso: bash escuela/scripts/crear_administrador.sh correo@ejemplo.com" >&2
  exit 2
fi

leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }

usuario_id="$(docker compose exec -T db psql -U postgres -tA -v correo="$correo" \
  <<< "select id from auth.users where email = lower(:'correo') and email_confirmed_at is not null")"
if [[ ! "$usuario_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "No existe un usuario verificado con ese correo." >&2
  exit 1
fi

docker compose exec -T -e PGPASSWORD="$(leer_env CONTRASENA_BD_N8N)" db \
  psql -h localhost -U "$(leer_env USUARIO_BD_N8N)" -d n8n -v ON_ERROR_STOP=1 -v usuario_id="$usuario_id" \
  <<< "insert into escuela.roles_usuario (usuario_id, rol) values (:'usuario_id', 'administrador') on conflict do nothing" > /dev/null
echo "Rol administrador asignado a $correo."
