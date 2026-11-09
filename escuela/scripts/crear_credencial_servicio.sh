#!/usr/bin/env bash
# Crea en n8n la credencial "Supabase rol de servicio" (Header Auth: Authorization: Bearer <SERVICE_ROLE_KEY>) (SPEC 07).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/crear_credencial_servicio.sh
# La clave se lee de .env y solo pasa por un archivo temporal que se borra al terminar; nunca queda en el repo.
set -euo pipefail

clave="$(grep -E '^SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-)"
[ -n "$clave" ] || { echo "Falta SERVICE_ROLE_KEY en .env" >&2; exit 1; }
directorio="$(mktemp -d)"
trap 'rm -rf "$directorio"; docker compose exec -T -u root n8n rm -f /tmp/credencial.json' EXIT

CLAVE="$clave" python3 - "$directorio/credencial.json" <<'PY'
import json, os, sys
credencial = [{"id": "supabaseServicio01", "name": "Supabase rol de servicio", "type": "httpHeaderAuth",
               "data": {"name": "Authorization", "value": "Bearer " + os.environ["CLAVE"]}}]
open(sys.argv[1], "w").write(json.dumps(credencial))
PY
docker compose cp "$directorio/credencial.json" n8n:/tmp/credencial.json > /dev/null
docker compose exec -T -u root n8n chmod 644 /tmp/credencial.json
propietario="$(docker compose exec -T -e PGPASSWORD="$(grep -E '^CONTRASENA_BD_N8N=' .env | cut -d= -f2-)" db \
  psql -h localhost -U "$(grep -E '^USUARIO_BD_N8N=' .env | cut -d= -f2-)" -d n8n -tA -c "select id from \"user\" where \"roleSlug\" = 'global:owner' limit 1")"
docker compose exec -T n8n n8n import:credentials --input=/tmp/credencial.json --userId="$propietario" > /dev/null
echo "Credencial 'Supabase rol de servicio' creada."
