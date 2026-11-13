#!/usr/bin/env bash
# Da el rol administrador a un usuario ya registrado y verificado (SPEC 07 y 10). Desde cualquier carpeta:
#   bash api/scripts/create-admin.sh correo@ejemplo.com
# Busca el uuid en auth.users (base postgres de Supabase) e inserta el rol en escuela.roles_usuario (base plataforma).
# Se conecta como supabase_admin por el socket del contenedor db: no lee ni imprime ningún secreto. Es idempotente.
# Salidas: 0 listo, 1 no existe una cuenta verificada con ese correo, 2 uso incorrecto.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"

correo="${1:-}"
if [[ ! "$correo" =~ ^[^[:space:]\'\"\;\\]+@[^[:space:]\'\"\;\\]+$ ]]; then
  echo "Uso: bash api/scripts/create-admin.sh correo@ejemplo.com" >&2
  exit 2
fi
correo="$(printf '%s' "$correo" | tr '[:upper:]' '[:lower:]')"

usuario_id="$(docker compose exec -T db psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1 -v correo="$correo" \
  <<< "select id from auth.users where email = lower(:'correo') and email_confirmed_at is not null")"
if [[ ! "$usuario_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "No existe un usuario verificado con ese correo." >&2
  exit 1
fi

docker compose exec -T db psql -U supabase_admin -d plataforma -v ON_ERROR_STOP=1 -v usuario_id="$usuario_id" \
  <<< "insert into escuela.roles_usuario (usuario_id, rol) values (:'usuario_id', 'administrador') on conflict do nothing" > /dev/null
echo "Rol administrador asignado a $correo."
