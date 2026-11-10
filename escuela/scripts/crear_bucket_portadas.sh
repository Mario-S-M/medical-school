#!/usr/bin/env bash
# Crea (o actualiza) el bucket público "portadas" de Supabase Storage (SPEC 07).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/crear_bucket_portadas.sh
# Solo acepta JPG, PNG y WebP de hasta 2 MB. Es idempotente: si ya existe, ajusta sus límites.
set -euo pipefail

clave="$(grep -E '^SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-)"
puerto="$(grep -E '^KONG_HTTP_PORT=' .env | head -1 | cut -d= -f2-)"
base="http://127.0.0.1:${puerto:-8000}/storage/v1"
cuerpo='{"id":"portadas","name":"portadas","public":true,"file_size_limit":2097152,"allowed_mime_types":["image/jpeg","image/png","image/webp"]}'

llamar() { # <método> <ruta>
  curl -s -o /dev/null -w '%{http_code}' -X "$1" "$base$2" -H "Authorization: Bearer $clave" -H "apikey: $clave" \
    -H 'Content-Type: application/json' -d "$cuerpo"
}

estado="$(llamar POST /bucket)"
if [ "$estado" = "409" ] || [ "$estado" = "400" ]; then estado="$(llamar PUT /bucket/portadas)"; fi
[ "$estado" = "200" ] || { echo "No se pudo crear el bucket (HTTP $estado)." >&2; exit 1; }
echo "Bucket 'portadas' listo (público, 2 MB, JPG/PNG/WebP)."
