#!/usr/bin/env bash
# Crea en n8n la credencial "Secreto transcodificador" (Header Auth, cabecera X-Secreto-Transcodificador) (SPEC 08).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/crear_credencial_transcodificador.sh
# El valor se lee de SECRETO_TRANSCODIFICADOR en .env; solo pasa por un archivo temporal que se borra al terminar.
# Sirve para los dos sentidos: n8n llama al transcodificador y el webhook interno autentica su aviso.
set -euo pipefail

secreto="$(grep -E '^SECRETO_TRANSCODIFICADOR=' .env | head -1 | cut -d= -f2-)"
[ -n "$secreto" ] || { echo "Falta SECRETO_TRANSCODIFICADOR en .env (openssl rand -hex 32)" >&2; exit 1; }
directorio="$(mktemp -d)"
trap 'rm -rf "$directorio"; docker compose exec -T -u root n8n rm -f /tmp/credencial_transcodificador.json' EXIT

SECRETO="$secreto" python3 - "$directorio/credencial.json" <<'PY'
import json, os, sys
credencial = [{"id": "secretoTranscodificador01", "name": "Secreto transcodificador", "type": "httpHeaderAuth",
               "data": {"name": "X-Secreto-Transcodificador", "value": os.environ["SECRETO"]}}]
open(sys.argv[1], "w").write(json.dumps(credencial))
PY
docker compose cp "$directorio/credencial.json" n8n:/tmp/credencial_transcodificador.json > /dev/null
docker compose exec -T -u root n8n chmod 644 /tmp/credencial_transcodificador.json
propietario="$(docker compose exec -T -e PGPASSWORD="$(grep -E '^CONTRASENA_BD_N8N=' .env | cut -d= -f2-)" db \
  psql -h localhost -U "$(grep -E '^USUARIO_BD_N8N=' .env | cut -d= -f2-)" -d n8n -tA -c "select id from \"user\" where \"roleSlug\" = 'global:owner' limit 1")"
docker compose exec -T n8n n8n import:credentials --input=/tmp/credencial_transcodificador.json --userId="$propietario" > /dev/null
echo "Credencial 'Secreto transcodificador' creada."
