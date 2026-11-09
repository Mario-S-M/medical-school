#!/usr/bin/env bash
# Pruebas de la API de autenticación (SPEC 04). Se ejecutan desde la raíz del repo con el stack levantado:
#   bash auth/pruebas/pruebas.sh
# No contiene secretos: lee lo necesario de .env. Sale con código 1 si algún caso falla.
set -u

BASE="http://127.0.0.1:8080"
DIRECTORIO_TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$DIRECTORIO_TEMPORAL"' EXIT
total=0
fallos=0

leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
ORIGEN_FRONT="$(leer_env ORIGEN_FRONT)"

# solicitar <metodo> <ruta> [argumentos de curl...]
# Deja el código en $estado, las cabeceras en $cabeceras y el cuerpo en $cuerpo.
solicitar() {
  local metodo="$1" ruta="$2"; shift 2
  curl -s -X "$metodo" -D "$DIRECTORIO_TEMPORAL/cabeceras" -o "$DIRECTORIO_TEMPORAL/cuerpo" "$@" "$BASE$ruta"
  estado="$(awk 'NR==1{print $2}' "$DIRECTORIO_TEMPORAL/cabeceras")"
  cabeceras="$(tr -d '\r' < "$DIRECTORIO_TEMPORAL/cabeceras")"
  cuerpo="$(cat "$DIRECTORIO_TEMPORAL/cuerpo")"
}

# verificar <descripcion> <condicion: 0 = cumple>
verificar() {
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then
    echo "  ok   $1"
  else
    echo "  FALLA $1"
    echo "        estado=$estado cuerpo=$(echo "$cuerpo" | head -c 200)"
    fallos=$((fallos + 1))
  fi
}
estado_es()    { [ "$estado" = "$1" ]; verificar "$2" $?; }
cuerpo_tiene() { echo "$cuerpo" | grep -qF -- "$1"; verificar "$2" $?; }
cabecera_tiene() { echo "$cabeceras" | grep -qiF -- "$1"; verificar "$2" $?; }
cabecera_no_tiene() { ! echo "$cabeceras" | grep -qiE -- "$1"; verificar "$2" $?; }

echo "== Caddy: rutas, métodos, tipo de contenido y tamaño"
for ruta in / /signin /webhook/autenticacion/yo /rest/settings /autenticacion/otra; do
  solicitar GET "$ruta"
  estado_es 404 "GET $ruta -> 404"
  cuerpo_tiene '"NO_ENCONTRADO"' "GET $ruta -> NO_ENCONTRADO"
done
solicitar GET /autenticacion/iniciar-sesion
estado_es 405 "GET iniciar-sesion -> 405"
cuerpo_tiene '"METODO_NO_PERMITIDO"' "GET iniciar-sesion -> METODO_NO_PERMITIDO"
solicitar POST /autenticacion/yo
estado_es 405 "POST yo -> 405"
solicitar POST /autenticacion/iniciar-sesion -H 'Content-Type: text/plain' -d x
estado_es 415 "POST text/plain -> 415"
cuerpo_tiene '"TIPO_CONTENIDO_NO_SOPORTADO"' "POST text/plain -> TIPO_CONTENIDO_NO_SOPORTADO"
head -c 12000 /dev/zero | tr '\0' 'a' > "$DIRECTORIO_TEMPORAL/grande"
solicitar POST /autenticacion/registro -H 'Content-Type: application/json' --data-binary "@$DIRECTORIO_TEMPORAL/grande"
estado_es 413 "POST de más de 10 KB -> 413"
cuerpo_tiene '"CUERPO_DEMASIADO_GRANDE"' "POST de más de 10 KB -> CUERPO_DEMASIADO_GRANDE"

echo "== Caddy: cabeceras de seguridad"
solicitar GET /
cabecera_tiene "X-Content-Type-Options: nosniff" "X-Content-Type-Options: nosniff"
cabecera_tiene "Cache-Control: no-store" "Cache-Control: no-store"
cabecera_tiene "Referrer-Policy: no-referrer" "Referrer-Policy: no-referrer"
cabecera_tiene "Content-Security-Policy: default-src 'none'" "Content-Security-Policy restrictiva"
cabecera_no_tiene '^server:' "sin cabecera Server"
solicitar POST /autenticacion/registro -H 'Content-Type: application/json' --data-binary "@$DIRECTORIO_TEMPORAL/grande"
cabecera_no_tiene '^server:' "sin cabecera Server en el 413"
cabecera_tiene "X-Content-Type-Options: nosniff" "cabeceras de seguridad también en el 413"

echo "== Caddy: CORS y origen"
solicitar OPTIONS /autenticacion/iniciar-sesion -H "Origin: $ORIGEN_FRONT" -H 'Access-Control-Request-Method: POST'
estado_es 204 "preflight con el origen del front -> 204"
cabecera_tiene "Access-Control-Allow-Origin: $ORIGEN_FRONT" "preflight: Allow-Origin igual al origen del front"
cabecera_tiene "Access-Control-Allow-Credentials: true" "preflight: Allow-Credentials true"
solicitar POST /autenticacion/iniciar-sesion -H 'Origin: http://malo.example' -H 'Content-Type: application/json' -d '{}'
estado_es 403 "POST con Origin ajeno -> 403"
cuerpo_tiene '"ORIGEN_NO_PERMITIDO"' "POST con Origin ajeno -> ORIGEN_NO_PERMITIDO"
cabecera_no_tiene '^access-control-allow-origin:' "Origin ajeno: sin Allow-Origin"
solicitar POST /autenticacion/renovar
estado_es 403 "renovar sin X-Solicitado-Con -> 403"
cuerpo_tiene '"ORIGEN_NO_PERMITIDO"' "renovar sin X-Solicitado-Con -> ORIGEN_NO_PERMITIDO"

echo
echo "Casos: $total, fallos: $fallos"
[ "$fallos" -eq 0 ]
