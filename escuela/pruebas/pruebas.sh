#!/usr/bin/env bash
# Pruebas de la API de la escuela (SPEC 07). Se ejecutan desde la raíz del repo con el stack levantado:
#   bash escuela/pruebas/pruebas.sh
# No contiene secretos: lee lo necesario de .env. Sale con código 1 si algún caso falla.
set -u

BASE="http://127.0.0.1:8080"
MAILPIT="http://127.0.0.1:8025"
DIRECTORIO_TEMPORAL="$(mktemp -d)"
total=0
fallos=0
SUFIJO="$$_$RANDOM"
CONTRASENA_VALIDA='Zorro#Azul-2026x'

leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
ORIGEN_FRONT="$(leer_env ORIGEN_FRONT)"
psql_postgres() { docker compose exec -T db psql -U postgres -tAc "$1"; }
psql_n8n() {
  docker compose exec -T -e PGPASSWORD="$(leer_env CONTRASENA_BD_N8N)" db psql -h localhost -U "$(leer_env USUARIO_BD_N8N)" -d n8n -tAc "$1"
}

# Limpia solo lo creado por estas pruebas (usuarios prueba_esc_*) y deja intacto el resto de la escuela
limpiar_datos() {
  local ids
  ids="$(psql_postgres "select string_agg(quote_literal(id::text), ',') from auth.users where email like 'prueba_esc_%@example.com'" 2> /dev/null)"
  if [ -n "$ids" ]; then
    psql_n8n "delete from escuela.cursos where instructor_id::text in ($ids)" > /dev/null 2>&1
    psql_n8n "delete from escuela.invitaciones_equipo where instructor_id::text in ($ids) or miembro_id::text in ($ids)" > /dev/null 2>&1
    psql_n8n "delete from escuela.equipos_apoyo where instructor_id::text in ($ids) or miembro_id::text in ($ids)" > /dev/null 2>&1
    psql_n8n "delete from escuela.perfiles_instructor where usuario_id::text in ($ids)" > /dev/null 2>&1
    psql_n8n "delete from escuela.roles_usuario where usuario_id::text in ($ids)" > /dev/null 2>&1
  fi
  psql_postgres "delete from auth.users where email like 'prueba_esc_%@example.com'" > /dev/null 2>&1
  psql_n8n "truncate autenticacion.intentos_inicio_sesion" > /dev/null 2>&1
  psql_n8n "truncate autenticacion.eventos_codigo" > /dev/null 2>&1
  curl -s -X DELETE "$MAILPIT/api/v1/messages" > /dev/null 2>&1
}
trap 'limpiar_datos; rm -rf "$DIRECTORIO_TEMPORAL"' EXIT
limpiar_datos

# solicitar <metodo> <ruta> [argumentos de curl...]: deja $estado, $cabeceras y $cuerpo
solicitar() {
  local metodo="$1" ruta="$2"; shift 2
  curl -s -X "$metodo" -D "$DIRECTORIO_TEMPORAL/cabeceras" -o "$DIRECTORIO_TEMPORAL/cuerpo" "$@" "$BASE$ruta"
  estado="$(awk 'NR==1{print $2}' "$DIRECTORIO_TEMPORAL/cabeceras")"
  cabeceras="$(tr -d '\r' < "$DIRECTORIO_TEMPORAL/cabeceras")"
  cuerpo="$(cat "$DIRECTORIO_TEMPORAL/cuerpo")"
}
publicar_json() { local ruta="$1" datos="$2"; shift 2; solicitar POST "$ruta" -H 'Content-Type: application/json' -H "Origin: $ORIGEN_FRONT" -d "$datos" "$@"; }
# api <metodo> <ruta> <token> [cuerpo json]: llamada a la escuela con sesión
api() {
  if [ -n "${4:-}" ]; then solicitar "$1" "$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d "$4"
  else solicitar "$1" "$2" -H "Authorization: Bearer $3"; fi
}
campo_json() { echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2> /dev/null; }

verificar() {
  total=$((total + 1))
  if [ "$2" -eq 0 ]; then echo "  ok   $1"
  else echo "  FALLA $1"; echo "        estado=$estado cuerpo=$(echo "$cuerpo" | head -c 300)"; fallos=$((fallos + 1)); fi
}
estado_es()       { [ "$estado" = "$1" ]; verificar "$2" $?; }
cuerpo_tiene()    { echo "$cuerpo" | grep -qF -- "$1"; verificar "$2" $?; }
cuerpo_no_tiene() { ! echo "$cuerpo" | grep -qF -- "$1"; verificar "$2" $?; }
cabecera_tiene()  { echo "$cabeceras" | grep -qiF -- "$1"; verificar "$2" $?; }

# --- Usuarios de prueba: se registran, se verifican con el código de Mailpit y se inician sesión ---
esperar_correo() {
  local n=0
  until [ "$(curl -s -G "$MAILPIT/api/v1/search" --data-urlencode "query=to:$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['messages_count'])")" -ge 1 ] || [ "$n" -ge 40 ]; do sleep 0.5; n=$((n + 1)); done
}
codigo_de_correo() {
  curl -s -G "$MAILPIT/api/v1/search" --data-urlencode "query=to:$1" | python3 -c "
import sys, json, urllib.request, re
d = json.load(sys.stdin)
c = json.load(urllib.request.urlopen('$MAILPIT/api/v1/message/' + d['messages'][0]['ID']))
print(re.search(r'\b[0-9]{6}\b', c['Text']).group(0))"
}
# crear_usuario <alias>: deja el correo en $CORREO_<alias> y el token en $TOKEN_<alias>
crear_usuario() {
  local correo="prueba_esc_${SUFIJO}_$1@example.com"
  publicar_json /autenticacion/registro "{\"correo\":\"$correo\",\"nombre\":\"Usuario $1\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
  esperar_correo "$correo"
  publicar_json /autenticacion/verificar-correo "{\"correo\":\"$correo\",\"codigo\":\"$(codigo_de_correo "$correo")\"}"
  curl -s -G -X DELETE "$MAILPIT/api/v1/search" --data-urlencode "query=to:$correo" > /dev/null
  publicar_json /autenticacion/iniciar-sesion "{\"correo\":\"$correo\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
  eval "CORREO_$1=\"$correo\"; TOKEN_$1=\"$(campo_json token_acceso)\""
}

echo "== Caddy: rutas, métodos, tipo de contenido y secreto del proxy"
solicitar GET /escuela/otra
estado_es 404 "GET /escuela/otra -> 404"
cuerpo_tiene '"NO_ENCONTRADO"' "ruta desconocida -> NO_ENCONTRADO"
solicitar POST /escuela/mis-roles
estado_es 405 "POST mis-roles -> 405"
solicitar GET /escuela/crear-curso
estado_es 405 "GET crear-curso -> 405"
solicitar POST /escuela/crear-curso -H 'Content-Type: text/plain' -d x
estado_es 415 "POST crear-curso sin JSON -> 415"
solicitar GET "/escuela/mis-roles?x=1"
estado_es 401 "GET con query no exige JSON (no da 415)"
solicitar POST /escuela/crear-curso -H 'Content-Type: application/json' -d "{\"x\":\"$(head -c 11000 /dev/zero | tr '\0' a)\"}"
estado_es 413 "POST de más de 10 KB -> 413"
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5678/webhook/escuela/mis-roles > "$DIRECTORIO_TEMPORAL/c"; estado="$(cat "$DIRECTORIO_TEMPORAL/c")"; cuerpo=""
estado_es 403 "puerto 5678 directo sin el secreto del proxy -> 403"

echo "== Mis roles"
solicitar GET /escuela/mis-roles
estado_es 401 "sin token -> 401"
cuerpo_tiene '"TOKEN_INVALIDO"' "sin token -> TOKEN_INVALIDO"
api GET /escuela/mis-roles "abc.def.ghi"
estado_es 401 "token malformado -> 401"
crear_usuario admin
crear_usuario estudiante
api GET /escuela/mis-roles "$TOKEN_estudiante"
estado_es 200 "usuario nuevo -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['roles']==[] and d['equipos']==[])")" = "True" ]; verificar "usuario nuevo -> roles y equipos vacíos" $?
bash escuela/scripts/crear_administrador.sh "$CORREO_admin" > /dev/null
api GET /escuela/mis-roles "$TOKEN_admin"
estado_es 200 "administrador -> 200"
cuerpo_tiene '"administrador"' "administrador -> rol administrador"

echo
echo "$((total - fallos)) de $total casos correctos"
[ "$fallos" -eq 0 ]
