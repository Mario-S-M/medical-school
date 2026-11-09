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
  psql_n8n "delete from escuela.categorias where nombre like 'Prueba esc %'" > /dev/null 2>&1
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

id_de() { psql_postgres "select id from auth.users where email = '$1'"; }
UUID_FALSO="00000000-0000-4000-8000-000000000000"

echo "== Administración: permisos"
for ruta in "GET /escuela/admin/buscar-usuario?correo=a@b.co"; do
  solicitar ${ruta%% *} "${ruta#* }"
  estado_es 401 "${ruta} sin token -> 401"
done
api GET "/escuela/admin/buscar-usuario?correo=$CORREO_admin" "$TOKEN_estudiante"
estado_es 403 "buscar-usuario sin rol administrador -> 403"
cuerpo_tiene '"SIN_PERMISO"' "buscar-usuario sin rol -> SIN_PERMISO"
api POST /escuela/admin/asignar-rol "$TOKEN_estudiante" "{\"usuario_id\":\"$UUID_FALSO\",\"rol\":\"instructor\",\"activo\":true}"
estado_es 403 "asignar-rol sin rol administrador -> 403"
api POST /escuela/admin/guardar-categoria "$TOKEN_estudiante" '{"nombre":"Prueba esc x","posicion":1}'
estado_es 403 "guardar-categoria sin rol administrador -> 403"
api POST /escuela/admin/borrar-categoria "$TOKEN_estudiante" '{"id":1}'
estado_es 403 "borrar-categoria sin rol administrador -> 403"
api POST /escuela/admin/guardar-categoria "$TOKEN_estudiante" '{"nombre":1,"extra":true}'
estado_es 403 "el permiso se comprueba antes que los datos (403, no 422)"

echo "== Administración: buscar usuario y asignar roles"
api GET "/escuela/admin/buscar-usuario?correo=$CORREO_estudiante" "$TOKEN_admin"
estado_es 200 "buscar-usuario de una cuenta existente -> 200"
cuerpo_tiene "\"$CORREO_estudiante\"" "buscar-usuario devuelve el correo"
cuerpo_tiene '"roles":[]' "la cuenta nueva no tiene roles"
api GET "/escuela/admin/buscar-usuario?correo=nadie_$SUFIJO@example.com" "$TOKEN_admin"
estado_es 404 "buscar-usuario de un correo inexistente -> 404"
api GET "/escuela/admin/buscar-usuario?correo=no-es-correo" "$TOKEN_admin"
estado_es 422 "buscar-usuario con un correo mal formado -> 422"
api GET "/escuela/admin/buscar-usuario?correo=$CORREO_estudiante&extra=1" "$TOKEN_admin"
estado_es 422 "buscar-usuario con un parámetro extra -> 422"
ID_ESTUDIANTE="$(id_de "$CORREO_estudiante")"; ID_ADMIN="$(id_de "$CORREO_admin")"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"equipo_apoyo\",\"activo\":true}"
estado_es 422 "asignar-rol no acepta equipo_apoyo -> 422"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"instructor\",\"activo\":\"si\"}"
estado_es 422 "asignar-rol con activo no booleano -> 422"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"instructor\",\"activo\":true,\"extra\":1}"
estado_es 422 "asignar-rol con un campo extra -> 422"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$UUID_FALSO\",\"rol\":\"instructor\",\"activo\":true}"
estado_es 404 "asignar-rol a una cuenta inexistente -> 404"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ADMIN\",\"rol\":\"administrador\",\"activo\":false}"
estado_es 409 "un administrador no puede quitarse su propio rol -> 409"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"instructor\",\"activo\":true}"
estado_es 200 "asignar-rol instructor -> 200"
[ "$(psql_n8n "select nombre_publico from escuela.perfiles_instructor where usuario_id = '$ID_ESTUDIANTE'")" = "Usuario estudiante" ]; verificar "el rol instructor crea su perfil con el nombre de la cuenta" $?
api GET /escuela/mis-roles "$TOKEN_estudiante"
cuerpo_tiene '"instructor"' "mis-roles refleja el nuevo rol sin volver a iniciar sesión"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"instructor\",\"activo\":true}"
estado_es 200 "asignar el mismo rol dos veces es idempotente"
api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$ID_ESTUDIANTE\",\"rol\":\"instructor\",\"activo\":false}"
estado_es 200 "asignar-rol con activo false -> 200"
[ "$(psql_n8n "select count(*) from escuela.roles_usuario where usuario_id = '$ID_ESTUDIANTE'")" = "0" ]; verificar "quitar el rol borra la fila" $?

echo "== Administración: categorías"
NOMBRE_A="Prueba esc $SUFIJO Anatomía"; NOMBRE_B="Prueba esc $SUFIJO Farmacología"
solicitar GET /escuela/categorias
estado_es 200 "categorias es público (sin token) -> 200"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"nombre\":\"$NOMBRE_A\",\"posicion\":900}"
estado_es 200 "guardar-categoria crea -> 200"
ID_CAT_A="$(campo_json id)"
[ -n "$(psql_n8n "select 1 from escuela.categorias where id = $ID_CAT_A and slug ~ '^[a-z0-9-]+\$' and slug like '%anatomia'")" ]; verificar "el slug no tiene acentos ni símbolos" $?
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"nombre\":\"$NOMBRE_B\",\"posicion\":901}"
ID_CAT_B="$(campo_json id)"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"nombre\":\"$NOMBRE_A\",\"posicion\":902}"
estado_es 409 "guardar-categoria con un nombre repetido -> 409"
cuerpo_tiene '"CATEGORIA_DUPLICADA"' "nombre repetido -> CATEGORIA_DUPLICADA"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"id\":$ID_CAT_B,\"nombre\":\"$NOMBRE_A\",\"posicion\":901}"
estado_es 409 "editar una categoría con el nombre de otra -> 409"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"id\":$ID_CAT_B,\"nombre\":\"$NOMBRE_B editada\",\"posicion\":895}"
estado_es 200 "editar una categoría -> 200"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" '{"id":32000,"nombre":"Prueba esc inexistente","posicion":1}'
estado_es 404 "editar una categoría inexistente -> 404"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" '{"nombre":"!!!","posicion":1}'
estado_es 422 "un nombre sin letras ni números -> 422"
cuerpo_tiene '"requiere_letra_o_numero"' "422 con la regla incumplida en detalles"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" '{"nombre":"Prueba esc ok","posicion":0}'
estado_es 422 "posición fuera de rango -> 422"
solicitar GET /escuela/categorias
cuerpo_tiene "$NOMBRE_A" "las categorías nuevas aparecen en el listado público"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; n=[c['nombre'] for c in json.load(sys.stdin)['categorias']]; print(n.index('$NOMBRE_B editada') < n.index('$NOMBRE_A'))")" = "True" ]; verificar "el listado público va ordenado por posición (895 antes que 900)" $?
psql_n8n "insert into escuela.cursos (slug, instructor_id, titulo, categoria_id) values ('prueba-esc-$SUFIJO', '$ID_ADMIN', 'Curso de prueba esc', $ID_CAT_A)" > /dev/null
api POST /escuela/admin/borrar-categoria "$TOKEN_admin" "{\"id\":$ID_CAT_A}"
estado_es 409 "borrar una categoría con cursos -> 409"
cuerpo_tiene '"CATEGORIA_EN_USO"' "categoría con cursos -> CATEGORIA_EN_USO"
api POST /escuela/admin/borrar-categoria "$TOKEN_admin" "{\"id\":$ID_CAT_B}"
estado_es 204 "borrar una categoría sin cursos -> 204"
api POST /escuela/admin/borrar-categoria "$TOKEN_admin" "{\"id\":$ID_CAT_B}"
estado_es 404 "borrar una categoría que ya no existe -> 404"

echo
echo "$((total - fallos)) de $total casos correctos"
[ "$fallos" -eq 0 ]
