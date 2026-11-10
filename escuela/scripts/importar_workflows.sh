#!/usr/bin/env bash
# Importa y publica en n8n los workflows de escuela/workflows/ (SPEC 07). Cada subcarpeta (usuarios/, escuela/)
# es una carpeta de n8n con el mismo nombre en mayúscula inicial (Usuarios, Escuela).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/importar_workflows.sh [archivo.json ...]
# Sin argumentos importa todos. Todos se publican: n8n no deja ejecutar un subworkflow que no esté activo.
set -euo pipefail

leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
psql_n8n() {
  docker compose exec -T -e PGPASSWORD="$(leer_env CONTRASENA_BD_N8N)" db \
    psql -h localhost -U "$(leer_env USUARIO_BD_N8N)" -d n8n -v ON_ERROR_STOP=1 -tA "$@"
}

propietario="$(psql_n8n -c "select id from \"user\" where \"roleSlug\" = 'global:owner' limit 1")"
proyecto="$(psql_n8n -c "select \"projectId\" from folder where id = 'carpetaAutenticacion01'")"

archivos=("$@")
[ ${#archivos[@]} -eq 0 ] && archivos=(escuela/workflows/*/*.json)

for archivo in "${archivos[@]}"; do
  directorio="$(basename "$(dirname "$archivo")")"
  nombre_carpeta="$(python3 -c "import sys; print(sys.argv[1].capitalize())" "$directorio")"
  carpeta="carpeta${nombre_carpeta}01"
  psql_n8n -c "insert into folder (id, name, \"projectId\") values ('$carpeta', '$nombre_carpeta', '$proyecto') on conflict (id) do nothing" > /dev/null
  id="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['id'])" "$archivo")"
  docker compose cp "$archivo" n8n:/tmp/wf.json > /dev/null
  docker compose exec -T -u root n8n chmod 644 /tmp/wf.json
  docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json --userId="$propietario" > /dev/null
  psql_n8n -c "update workflow_entity set \"parentFolderId\" = '$carpeta' where id = '$id'" > /dev/null
  docker compose exec -T n8n n8n publish:workflow --id="$id" > /dev/null 2>&1
  echo "Importado: $id"
done

docker compose restart n8n > /dev/null
echo "n8n reiniciado para registrar los webhooks."
