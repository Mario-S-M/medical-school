#!/usr/bin/env bash
# Crea (o actualiza) el bucket PRIVADO "videos" de Supabase Storage (SPEC 08).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/crear_bucket_videos.sh
# Guarda los originales (mientras se procesan) y el HLS cifrado de cada clase, con rutas
# cursos/<curso>/secciones/<seccion>/clases/<clase>/<video>/. Tope de 1 GiB. Es idempotente.
set -euo pipefail

clave="$(grep -E '^SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-)"
puerto="$(grep -E '^KONG_HTTP_PORT=' .env | head -1 | cut -d= -f2-)"
base="http://127.0.0.1:${puerto:-8000}/storage/v1"
cuerpo='{"id":"videos","name":"videos","public":false,"file_size_limit":1073741824,"allowed_mime_types":["video/mp4","video/quicktime","video/webm","application/vnd.apple.mpegurl","video/mp2t"]}'

llamar() { # <método> <ruta>
  curl -s -o /dev/null -w '%{http_code}' -X "$1" "$base$2" -H "Authorization: Bearer $clave" -H "apikey: $clave" \
    -H 'Content-Type: application/json' -d "$cuerpo"
}

estado="$(llamar POST /bucket)"
if [ "$estado" = "409" ] || [ "$estado" = "400" ]; then estado="$(llamar PUT /bucket/videos)"; fi
[ "$estado" = "200" ] || { echo "No se pudo crear el bucket (HTTP $estado)." >&2; exit 1; }
echo "Bucket 'videos' listo (privado, 1 GiB)."
