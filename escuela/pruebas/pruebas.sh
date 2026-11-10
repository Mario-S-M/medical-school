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

ALMACEN="http://127.0.0.1:$(leer_env KONG_HTTP_PORT)/storage/v1"
RUTAS_PORTADA=()
borrar_portadas() {
  local clave; clave="$(leer_env SERVICE_ROLE_KEY)"
  for ruta in "${RUTAS_PORTADA[@]:-}"; do
    [ -n "$ruta" ] && curl -s -o /dev/null -X DELETE "$ALMACEN/object/portadas/$ruta" -H "Authorization: Bearer $clave" -H "apikey: $clave"
  done
}

PREFIJOS_VIDEO=()
borrar_videos() {
  [ "${#PREFIJOS_VIDEO[@]}" -gt 0 ] && ALMACEN="$ALMACEN" CLAVE_SERVICIO="$(leer_env SERVICE_ROLE_KEY)" python3 escuela/pruebas/limpiar_bucket.py videos "${PREFIJOS_VIDEO[@]}" > /dev/null 2>&1
  docker compose unpause transcodificador > /dev/null 2>&1
  docker compose start transcodificador > /dev/null 2>&1
}

# Limpia solo lo creado por estas pruebas (usuarios prueba_esc_*) y deja intacto el resto de la escuela
limpiar_datos() {
  local ids
  borrar_portadas
  borrar_videos
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
# poner_video_listo <clase_id>: deja un video listo y vigente (sin archivos) para los casos que solo necesitan que la clase "tenga video"
poner_video_listo() { psql_n8n "insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, duracion_segundos, ruta_base, listo_en) values ($1, 'listo', true, 'a.mp4', 'video/mp4', 10, 60, 'x', now())" > /dev/null; }

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

echo "== Cursos del instructor"
crear_usuario instructor_a
crear_usuario instructor_b
crear_usuario miembro
ID_A="$(id_de "$CORREO_instructor_a")"; ID_B="$(id_de "$CORREO_instructor_b")"; ID_MIEMBRO="$(id_de "$CORREO_miembro")"
for id in "$ID_A" "$ID_B"; do api POST /escuela/admin/asignar-rol "$TOKEN_admin" "{\"usuario_id\":\"$id\",\"rol\":\"instructor\",\"activo\":true}"; done
api POST /escuela/crear-curso "$TOKEN_estudiante" '{"titulo":"Anatomía básica del cuerpo"}'
estado_es 403 "crear-curso sin rol instructor -> 403"
solicitar POST /escuela/crear-curso -H 'Content-Type: application/json' -d '{"titulo":"Anatomía básica"}'
estado_es 401 "crear-curso sin token -> 401"
api POST /escuela/crear-curso "$TOKEN_instructor_a" '{"titulo":"Ana"}'
estado_es 422 "crear-curso con un título demasiado corto -> 422"
api POST /escuela/crear-curso "$TOKEN_instructor_a" '{"titulo":"Anatomía básica","extra":1}'
estado_es 422 "crear-curso con un campo extra -> 422"
api POST /escuela/crear-curso "$TOKEN_instructor_a" "{\"titulo\":\"Prueba esc $SUFIJO Anatomía básica\"}"
estado_es 201 "crear-curso -> 201"
CURSO_A="$(campo_json id)"; SLUG_A="$(campo_json slug)"
[[ "$SLUG_A" =~ ^[a-z0-9-]+$ && "$SLUG_A" == *anatomia-basica ]]; verificar "el slug no tiene acentos ni símbolos" $?
api POST /escuela/crear-curso "$TOKEN_instructor_a" "{\"titulo\":\"Prueba esc $SUFIJO Anatomía básica\"}"
[ "$(campo_json slug)" = "$SLUG_A-2" ]; verificar "un segundo curso con el mismo título recibe el sufijo -2" $?
[ "$(psql_n8n "select estado from escuela.cursos where id = $CURSO_A")" = "borrador" ]; verificar "el curso nace en borrador" $?
api POST /escuela/crear-curso "$TOKEN_instructor_b" "{\"titulo\":\"Prueba esc $SUFIJO Fisiología\"}"
CURSO_B="$(campo_json id)"

echo "== Cursos: mis-cursos y curso-edicion"
api GET /escuela/mis-cursos "$TOKEN_estudiante"
estado_es 403 "mis-cursos sin rol -> 403"
api GET /escuela/mis-cursos "$TOKEN_instructor_a"
estado_es 200 "mis-cursos -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; c=json.load(sys.stdin)['cursos']; print(len(c)==2 and all(x['es_mio'] for x in c))")" = "True" ]; verificar "mis-cursos devuelve solo los dos cursos propios" $?
api GET "/escuela/mis-cursos?x=1" "$TOKEN_instructor_a"
estado_es 422 "mis-cursos con un parámetro extra -> 422"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
estado_es 200 "curso-edicion del dueño -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['es_dueno'] is True and d['estado']=='borrador' and d['secciones']==[] and d['lo_que_aprenderas']==[])")" = "True" ]; verificar "curso-edicion trae el estado, es_dueno y el temario vacío" $?
api GET "/escuela/curso-edicion?id=$CURSO_B" "$TOKEN_instructor_a"
estado_es 403 "curso-edicion de un curso ajeno -> 403"
api GET "/escuela/curso-edicion?id=99999999" "$TOKEN_instructor_a"
estado_es 404 "curso-edicion de un curso inexistente -> 404"
api GET "/escuela/curso-edicion?id=abc" "$TOKEN_instructor_a"
estado_es 422 "curso-edicion con un id no numérico -> 422"

echo "== Cursos: editar-curso"
api POST /escuela/admin/guardar-categoria "$TOKEN_admin" "{\"nombre\":\"Prueba esc $SUFIJO Ciencias\",\"posicion\":950}"
ID_CAT="$(campo_json id)"
DATOS="{\"curso_id\":$CURSO_A,\"titulo\":\"Prueba esc $SUFIJO Anatomía del cuerpo\",\"subtitulo\":\"Huesos y músculos\",\"descripcion\":\"Línea uno\\nLínea dos\",\"conocimientos_previos\":\"Nada\",\"lo_que_aprenderas\":[\" Huesos \",\"Músculos\"],\"nivel\":\"basico\",\"categoria_id\":$ID_CAT}"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "$DATOS"
estado_es 200 "editar-curso del dueño -> 200"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['subtitulo']=='Huesos y músculos' and d['lo_que_aprenderas']==['Huesos','Músculos'] and d['nivel']=='basico' and d['categoria_id']==$ID_CAT and d['slug']=='$SLUG_A')")" = "True" ]; verificar "los cambios se guardan (textos recortados) y el slug no cambia" $?
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"subtitulo\":\"\"}"
estado_es 200 "editar solo un campo -> 200"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['subtitulo'] is None and d['nivel']=='basico' and d['titulo'].endswith('del cuerpo'))")" = "True" ]; verificar "enviar vacío limpia un campo y lo omitido no cambia" $?
api POST /escuela/editar-curso "$TOKEN_instructor_b" "$DATOS"
estado_es 403 "editar-curso de un curso ajeno -> 403"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":99999999,\"nivel\":\"basico\"}"
estado_es 404 "editar-curso de un curso inexistente -> 404"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"categoria_id\":32000}"
estado_es 422 "editar-curso con una categoría inexistente -> 422"
cuerpo_tiene '"categoria_inexistente"' "categoría inexistente -> regla en detalles"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"nivel\":\"experto\"}"
estado_es 422 "editar-curso con un nivel no permitido -> 422"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"lo_que_aprenderas\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\"]}"
estado_es 422 "editar-curso con más de 10 elementos en lo que aprenderás -> 422"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"slug\":\"otro\"}"
estado_es 422 "editar-curso no acepta cambiar el slug -> 422"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"titulo\":\"Ana\"}"
estado_es 422 "editar-curso con un título demasiado corto -> 422"

echo "== Cursos: equipo de apoyo y revisión"
psql_n8n "insert into escuela.roles_usuario (usuario_id, rol) values ('$ID_MIEMBRO', 'equipo_apoyo'); insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('$ID_A', '$ID_MIEMBRO')" > /dev/null
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_miembro"
estado_es 200 "un miembro del equipo puede abrir el curso en el editor"
cuerpo_tiene '"es_dueno":false' "el miembro del equipo no es dueño"
api GET /escuela/mis-cursos "$TOKEN_miembro"
cuerpo_tiene "\"id\":$CURSO_A" "mis-cursos del miembro incluye los cursos de su instructor"
api POST /escuela/editar-curso "$TOKEN_miembro" "{\"curso_id\":$CURSO_A,\"nivel\":\"basico\"}"
estado_es 403 "el equipo de apoyo no edita los datos del curso (403)"
api GET "/escuela/curso-edicion?id=$CURSO_B" "$TOKEN_miembro"
estado_es 403 "el miembro no ve cursos de otros instructores"
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_A" > /dev/null
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"nivel\":\"basico\"}"
estado_es 409 "editar un curso en revisión -> 409"
cuerpo_tiene '"CURSO_EN_REVISION"' "curso en revisión -> CURSO_EN_REVISION"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
estado_es 200 "un curso en revisión se puede abrir (solo lectura)"

echo "== Temario: secciones y clases"
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_A" > /dev/null
posiciones() { psql_n8n "select string_agg(posicion::text, ',' order by posicion) from escuela.$1 where $2"; }
api POST /escuela/guardar-seccion "$TOKEN_estudiante" "{\"curso_id\":$CURSO_A,\"titulo\":\"Intro\"}"
estado_es 403 "guardar-seccion sin rol -> 403"
api POST /escuela/guardar-seccion "$TOKEN_instructor_b" "{\"curso_id\":$CURSO_A,\"titulo\":\"Intro\"}"
estado_es 403 "guardar-seccion en un curso ajeno -> 403"
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"titulo\":\"\"}"
estado_es 422 "guardar-seccion con un título vacío -> 422"
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":99999999,\"titulo\":\"Intro\"}"
estado_es 404 "guardar-seccion en un curso inexistente -> 404"
ANTES="$(psql_n8n "select actualizado_en from escuela.cursos where id = $CURSO_A")"; sleep 1
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"titulo\":\"Introducción\"}"
estado_es 200 "guardar-seccion del dueño -> 200"
SEC1="$(campo_json id)"
[ "$(psql_n8n "select actualizado_en from escuela.cursos where id = $CURSO_A")" != "$ANTES" ]; verificar "editar el temario actualiza la fecha del curso" $?
api POST /escuela/guardar-seccion "$TOKEN_miembro" "{\"curso_id\":$CURSO_A,\"titulo\":\"Huesos\"}"
estado_es 200 "el equipo de apoyo puede crear secciones"
SEC2="$(campo_json id)"
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"titulo\":\"Músculos\"}"
SEC3="$(campo_json id)"
[ "$(posiciones secciones "curso_id = $CURSO_A")" = "1,2,3" ]; verificar "las secciones nuevas quedan al final con posiciones 1,2,3" $?
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"seccion_id\":$SEC1,\"titulo\":\"Introducción general\"}"
estado_es 200 "guardar-seccion con seccion_id renombra"
[ "$(psql_n8n "select titulo from escuela.secciones where id = $SEC1")" = "Introducción general" ]; verificar "el nombre de la sección cambió" $?
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"seccion_id\":99999999,\"titulo\":\"X\"}"
estado_es 404 "renombrar una sección que no es del curso -> 404"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"titulo\":\"Bienvenida\",\"es_muestra\":true,\"duracion_estimada_minutos\":4,\"descripcion\":\"Hola\"}"
estado_es 200 "guardar-clase -> 200"
CLA1="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_miembro" "{\"seccion_id\":$SEC1,\"titulo\":\"Cómo estudiar\",\"es_muestra\":false}"
estado_es 200 "el equipo de apoyo puede crear clases"
CLA2="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"titulo\":\"Cierre\",\"es_muestra\":false}"
CLA3="$(campo_json id)"
[ "$(posiciones clases "seccion_id = $SEC1")" = "1,2,3" ]; verificar "las clases nuevas quedan al final con posiciones 1,2,3" $?
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"clase_id\":$CLA2,\"titulo\":\"Cómo estudiar mejor\",\"es_muestra\":true,\"duracion_estimada_minutos\":6}"
estado_es 200 "guardar-clase con clase_id edita"
[ "$(psql_n8n "select es_muestra and duracion_estimada_minutos = 6 and titulo = 'Cómo estudiar mejor' from escuela.clases where id = $CLA2")" = "t" ]; verificar "la clase se editó (muestra y duración)" $?
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"titulo\":\"X\",\"es_muestra\":false,\"duracion_estimada_minutos\":0}"
estado_es 422 "duración estimada de 0 minutos -> 422"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"titulo\":\"X\",\"es_muestra\":false,\"duracion_estimada_minutos\":181}"
estado_es 422 "duración estimada de más de 180 minutos -> 422"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1,\"titulo\":\"X\"}"
estado_es 422 "es_muestra es obligatorio -> 422"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC2,\"clase_id\":$CLA1,\"titulo\":\"X\",\"es_muestra\":false}"
estado_es 404 "editar una clase con la sección de otra -> 404"
api POST /escuela/guardar-clase "$TOKEN_instructor_b" "{\"seccion_id\":$SEC1,\"titulo\":\"X\",\"es_muestra\":false}"
estado_es 403 "guardar-clase en un curso ajeno -> 403"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":99999999,\"titulo\":\"X\",\"es_muestra\":false}"
estado_es 404 "guardar-clase en una sección inexistente -> 404"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; s=json.load(sys.stdin)['secciones']; print([x['posicion'] for x in s]==[1,2,3] and [c['posicion'] for c in s[0]['clases']]==[1,2,3] and s[0]['clases'][0]['es_muestra'] is True)")" = "True" ]; verificar "curso-edicion devuelve el temario completo y en orden" $?

echo "== Temario: mover y borrar"
api POST /escuela/mover "$TOKEN_instructor_a" "{\"tipo\":\"seccion\",\"id\":$SEC1,\"direccion\":\"subir\"}"
estado_es 200 "subir la primera sección -> 200"
cuerpo_tiene '"movido":false' "subir el primero no cambia nada"
api POST /escuela/mover "$TOKEN_instructor_a" "{\"tipo\":\"seccion\",\"id\":$SEC1,\"direccion\":\"bajar\"}"
cuerpo_tiene '"movido":true' "bajar la primera sección sí mueve"
[ "$(psql_n8n "select string_agg(id::text, ',' order by posicion) from escuela.secciones where curso_id = $CURSO_A")" = "$SEC2,$SEC1,$SEC3" ]; verificar "el orden de las secciones quedó $SEC2,$SEC1,$SEC3" $?
api POST /escuela/mover "$TOKEN_miembro" "{\"tipo\":\"clase\",\"id\":$CLA3,\"direccion\":\"subir\"}"
estado_es 200 "el equipo de apoyo puede reordenar clases"
[ "$(psql_n8n "select string_agg(id::text, ',' order by posicion) from escuela.clases where seccion_id = $SEC1")" = "$CLA1,$CLA3,$CLA2" ]; verificar "el orden de las clases quedó $CLA1,$CLA3,$CLA2" $?
[ "$(posiciones clases "seccion_id = $SEC1")" = "1,2,3" ]; verificar "mover deja las posiciones 1,2,3 sin huecos" $?
api POST /escuela/mover "$TOKEN_instructor_a" "{\"tipo\":\"otro\",\"id\":$SEC1,\"direccion\":\"subir\"}"
estado_es 422 "mover con un tipo inválido -> 422"
api POST /escuela/mover "$TOKEN_instructor_b" "{\"tipo\":\"seccion\",\"id\":$SEC1,\"direccion\":\"subir\"}"
estado_es 403 "mover en un curso ajeno -> 403"
api POST /escuela/mover "$TOKEN_instructor_a" "{\"tipo\":\"clase\",\"id\":99999999,\"direccion\":\"subir\"}"
estado_es 404 "mover un elemento inexistente -> 404"
api POST /escuela/borrar-clase "$TOKEN_instructor_b" "{\"clase_id\":$CLA1}"
estado_es 403 "borrar-clase en un curso ajeno -> 403"
api POST /escuela/borrar-clase "$TOKEN_instructor_a" "{\"clase_id\":$CLA1}"
estado_es 204 "borrar-clase -> 204"
[ "$(posiciones clases "seccion_id = $SEC1")" = "1,2" ]; verificar "borrar una clase renumera las demás (1,2)" $?
api POST /escuela/borrar-clase "$TOKEN_instructor_a" "{\"clase_id\":$CLA1}"
estado_es 404 "borrar una clase que ya no existe -> 404"
api POST /escuela/borrar-seccion "$TOKEN_instructor_b" "{\"seccion_id\":$SEC2}"
estado_es 403 "borrar-seccion en un curso ajeno -> 403"
api POST /escuela/borrar-seccion "$TOKEN_instructor_a" "{\"seccion_id\":$SEC2}"
estado_es 204 "borrar-seccion -> 204"
[ "$(posiciones secciones "curso_id = $CURSO_A")" = "1,2" ]; verificar "borrar una sección renumera las demás (1,2)" $?
api POST /escuela/borrar-seccion "$TOKEN_instructor_a" "{\"seccion_id\":$SEC1}"
estado_es 204 "borrar una sección con clases -> 204"
[ "$(psql_n8n "select count(*) from escuela.clases where seccion_id = $SEC1")" = "0" ]; verificar "las clases de la sección borrada se borraron" $?
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_A" > /dev/null
for caso in "guardar-seccion|{\"curso_id\":$CURSO_A,\"titulo\":\"X\"}" "guardar-clase|{\"seccion_id\":$SEC3,\"titulo\":\"X\",\"es_muestra\":false}" "borrar-seccion|{\"seccion_id\":$SEC3}" "mover|{\"tipo\":\"seccion\",\"id\":$SEC3,\"direccion\":\"subir\"}"; do
  api POST "/escuela/${caso%%|*}" "$TOKEN_instructor_a" "${caso#*|}"
  estado_es 409 "${caso%%|*} en un curso en revisión -> 409"
done

echo "== Revisión"
api POST /escuela/enviar-revision "$TOKEN_estudiante" "{\"curso_id\":$CURSO_A}"
estado_es 403 "enviar-revision sin rol instructor -> 403"
api POST /escuela/enviar-revision "$TOKEN_instructor_b" "{\"curso_id\":$CURSO_A}"
estado_es 403 "enviar-revision de un curso ajeno -> 403"
api POST /escuela/enviar-revision "$TOKEN_miembro" "{\"curso_id\":$CURSO_A}"
estado_es 403 "el equipo de apoyo no envía a revisión (403)"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 409 "enviar un curso que ya está en revisión -> 409"
psql_n8n "update escuela.cursos set estado = 'borrador', portada_ruta = null where id = $CURSO_A; update escuela.cursos set subtitulo = 'Huesos', descripcion = 'Descripción', nivel = 'basico', categoria_id = $ID_CAT where id = $CURSO_A" > /dev/null
api POST /escuela/borrar-seccion "$TOKEN_instructor_a" "{\"seccion_id\":$SEC3}"
estado_es 204 "se borra la última sección del curso para probar falta_secciones"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 422 "enviar-revision con faltantes -> 422"
cuerpo_tiene '"CURSO_INCOMPLETO"' "faltantes -> CURSO_INCOMPLETO"
cuerpo_tiene '"falta_portada"' "detalles incluye falta_portada"
cuerpo_tiene '"falta_secciones"' "detalles incluye falta_secciones (curso sin secciones)"
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"titulo\":\"Sección vacía\"}"
SEC_V="$(campo_json id)"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
cuerpo_tiene '"seccion_vacia"' "una sección sin clases cuenta como falta (seccion_vacia)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_V,\"titulo\":\"Clase única\",\"es_muestra\":true}"
CLA_UNICA="$(campo_json id)"
psql_n8n "update escuela.cursos set portada_ruta = 'cursos/$CURSO_A/portada-prueba.png' where id = $CURSO_A" > /dev/null
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 422 "enviar-revision con todo menos el video de la clase -> 422"
cuerpo_tiene '"falta_video"' "sin video listo, la falta es falta_video (SPEC 08)"
poner_video_listo "$CLA_UNICA"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 200 "enviar-revision de un curso completo, con video en cada clase -> 200"
[ "$(psql_n8n "select estado from escuela.cursos where id = $CURSO_A")" = "en_revision" ]; verificar "el curso quedó en_revision" $?
api GET /escuela/admin/cursos-en-revision "$TOKEN_estudiante"
estado_es 403 "cursos-en-revision sin rol administrador -> 403"
api GET /escuela/admin/cursos-en-revision "$TOKEN_admin"
estado_es 200 "cursos-en-revision -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; c=[x for x in json.load(sys.stdin)['cursos'] if x['id']==$CURSO_A]; print(len(c)==1 and c[0]['secciones'][0]['clases'][0]['titulo']=='Clase única' and c[0]['categoria'].startswith('Prueba esc'))")" = "True" ]; verificar "la lista trae el curso con su categoría y su temario" $?
api POST /escuela/admin/resolver-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"aprobar\":true}"
estado_es 403 "un instructor no resuelve revisiones (403)"
api POST /escuela/admin/resolver-revision "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"aprobar\":false}"
estado_es 422 "devolver sin comentario -> 422"
cuerpo_tiene '"obligatorio_si_se_devuelve"' "devolver sin comentario -> regla en detalles"
api POST /escuela/admin/resolver-revision "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"aprobar\":false,\"comentario\":\"Falta la descripción de la clase única\"}"
estado_es 200 "devolver con comentario -> 200"
api GET "/escuela/curso-edicion?id=$CURSO_A" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['estado']=='borrador' and d['comentario_revision']=='Falta la descripción de la clase única')")" = "True" ]; verificar "el instructor ve el curso en borrador con el comentario" $?
api POST /escuela/admin/resolver-revision "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"aprobar\":true}"
estado_es 409 "resolver un curso que no está en revisión -> 409"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
[ "$(psql_n8n "select comentario_revision is null from escuela.cursos where id = $CURSO_A")" = "t" ]; verificar "al reenviar se borra el comentario anterior" $?
api POST /escuela/admin/resolver-revision "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"aprobar\":true}"
estado_es 200 "aprobar -> 200"
[ "$(psql_n8n "select estado = 'publicado' and publicado_en is not null and comentario_revision is null from escuela.cursos where id = $CURSO_A")" = "t" ]; verificar "aprobar publica el curso y fija publicado_en" $?
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 409 "enviar a revisión un curso ya publicado -> 409"
api POST /escuela/admin/resolver-revision "$TOKEN_admin" '{"curso_id":99999999,"aprobar":true}'
estado_es 404 "resolver un curso inexistente -> 404"
api POST /escuela/admin/retirar-curso "$TOKEN_admin" "{\"curso_id\":$CURSO_A}"
estado_es 422 "retirar-curso sin comentario -> 422"
api POST /escuela/admin/retirar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"comentario\":\"x\"}"
estado_es 403 "un instructor no retira cursos (403)"
api POST /escuela/admin/retirar-curso "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"comentario\":\"Contenido desactualizado\"}"
estado_es 200 "retirar-curso -> 200"
[ "$(psql_n8n "select estado = 'borrador' and comentario_revision = 'Contenido desactualizado' from escuela.cursos where id = $CURSO_A")" = "t" ]; verificar "retirar devuelve el curso a borrador con el comentario" $?
api POST /escuela/admin/retirar-curso "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"comentario\":\"otra vez\"}"
estado_es 409 "retirar un curso que no está publicado -> 409"
api GET /escuela/admin/cursos-en-revision "$TOKEN_admin"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; print(all(x['id']!=$CURSO_A for x in json.load(sys.stdin)['cursos']))")" = "True" ]; verificar "un curso retirado ya no aparece entre los pendientes" $?

echo "== Portadas"
python3 -c "
import base64
open('$DIRECTORIO_TEMPORAL/portada.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='))
open('$DIRECTORIO_TEMPORAL/grande.png','wb').write(b'\x89PNG' + b'0' * 3000000)"
subir_archivo() { # <url_subida> <tipo> <archivo>: sube a Storage por Kong con la URL firmada
  curl -s -o /dev/null -w '%{http_code}' -X PUT "$ALMACEN${1#/almacen}" -H "Content-Type: $2" --data-binary "@$3"
}
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_A" > /dev/null
api POST /escuela/url-subida-portada "$TOKEN_estudiante" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":100}"
estado_es 403 "url-subida-portada sin rol instructor -> 403"
api POST /escuela/url-subida-portada "$TOKEN_instructor_b" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":100}"
estado_es 403 "url-subida-portada de un curso ajeno -> 403"
api POST /escuela/url-subida-portada "$TOKEN_miembro" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":100}"
estado_es 403 "el equipo de apoyo no cambia la portada (403)"
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/gif\",\"tamano_bytes\":100}"
estado_es 422 "url-subida-portada con image/gif -> 422"
cuerpo_tiene '"PORTADA_INVALIDA"' "image/gif -> PORTADA_INVALIDA"
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":2097153}"
estado_es 422 "url-subida-portada con más de 2 097 152 bytes -> 422"
cuerpo_tiene '"PORTADA_INVALIDA"' "más de 2 MB -> PORTADA_INVALIDA"
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\"}"
estado_es 422 "url-subida-portada sin tamano_bytes -> 422"
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":2097152}"
estado_es 200 "url-subida-portada con exactamente 2 MB -> 200"
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":$(wc -c < "$DIRECTORIO_TEMPORAL/portada.png" | tr -d ' ')}"
estado_es 200 "url-subida-portada de un PNG válido -> 200"
URL_1="$(campo_json url_subida)"; RUTA_1="$(campo_json ruta)"; RUTAS_PORTADA+=("$RUTA_1")
[[ "$URL_1" == /almacen/object/upload/sign/portadas/cursos/$CURSO_A/portada-* && "$RUTA_1" == cursos/$CURSO_A/portada-*.png ]]; verificar "la URL firmada y la ruta tienen el formato esperado" $?
api POST /escuela/confirmar-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"ruta\":\"$RUTA_1\"}"
estado_es 422 "confirmar una portada que todavía no se subió -> 422"
cuerpo_tiene '"PORTADA_INVALIDA"' "archivo no subido -> PORTADA_INVALIDA"
[ "$(subir_archivo "$URL_1" image/png "$DIRECTORIO_TEMPORAL/portada.png")" = "200" ]; verificar "el navegador sube el archivo con la URL firmada (200)" $?
api POST /escuela/confirmar-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"ruta\":\"cursos/$CURSO_B/portada-0123456789abcdef0123456789abcdef.png\"}"
estado_es 422 "confirmar una ruta de otro curso -> 422"
api POST /escuela/confirmar-portada "$TOKEN_instructor_b" "{\"curso_id\":$CURSO_A,\"ruta\":\"$RUTA_1\"}"
estado_es 403 "confirmar-portada de un curso ajeno -> 403"
api POST /escuela/confirmar-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"ruta\":\"$RUTA_1\"}"
estado_es 200 "confirmar-portada -> 200"
PORTADA_URL="$(campo_json portada_url)"
[ "$PORTADA_URL" = "/almacen/object/public/portadas/$RUTA_1" ]; verificar "confirmar-portada devuelve la URL pública" $?
[ "$(psql_n8n "select portada_ruta from escuela.cursos where id = $CURSO_A")" = "$RUTA_1" ]; verificar "la ruta quedó guardada en el curso" $?
[ "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$ALMACEN${PORTADA_URL#/almacen}")" = "200 image/png" ]; verificar "la portada se lee sin sesión (200, image/png)" $?
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":100}"
URL_2="$(campo_json url_subida)"; RUTA_2="$(campo_json ruta)"; RUTAS_PORTADA+=("$RUTA_2")
[ "$(subir_archivo "$URL_2" image/png "$DIRECTORIO_TEMPORAL/portada.png")" = "200" ]; verificar "se sube una segunda portada" $?
api POST /escuela/confirmar-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"ruta\":\"$RUTA_2\"}"
estado_es 200 "confirmar la segunda portada -> 200"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$ALMACEN/object/public/portadas/$RUTA_1")" != "200" ]; verificar "la portada anterior se borró del bucket" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$ALMACEN/object/public/portadas/$RUTA_2")" = "200" ]; verificar "la nueva portada se sirve" $?
CLAVE_SERVICIO="$(leer_env SERVICE_ROLE_KEY)"
for caso in "gif|image/gif|portada.png" "grande|image/png|grande.png"; do
  IFS='|' read -r nombre tipo archivo <<< "$caso"
  ruta="cursos/$CURSO_A/directa-$nombre.${tipo#image/}"; RUTAS_PORTADA+=("$ruta")
  firmada="$(curl -s -X POST "$ALMACEN/object/upload/sign/portadas/$ruta" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")"
  [ "$(subir_archivo "$firmada" "$tipo" "$DIRECTORIO_TEMPORAL/$archivo")" != "200" ]; verificar "Storage rechaza por sí solo un archivo $nombre (el bucket tiene sus propios límites)" $?
done
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_A" > /dev/null
api POST /escuela/url-subida-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"tipo_contenido\":\"image/png\",\"tamano_bytes\":100}"
estado_es 409 "url-subida-portada en un curso en revisión -> 409"
api POST /escuela/confirmar-portada "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A,\"ruta\":\"$RUTA_2\"}"
estado_es 409 "confirmar-portada en un curso en revisión -> 409"

echo "== Catálogo público"
psql_n8n "update escuela.cursos set estado = 'publicado', publicado_en = now(), nivel = 'basico', categoria_id = $ID_CAT where id = $CURSO_A" > /dev/null
psql_n8n "insert into escuela.secciones (curso_id, titulo, posicion) select $CURSO_A, 'Sección extra', 9 where not exists (select 1 from escuela.secciones where curso_id = $CURSO_A and posicion = 9)" > /dev/null
solicitar GET "/escuela/cursos?categoria=$(psql_n8n "select slug from escuela.categorias where id = $ID_CAT")"
estado_es 200 "cursos es público (sin token) -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total']==1 and d['pagina']==1 and d['paginas']==1 and d['cursos'][0]['slug']=='$SLUG_A')")" = "True" ]; verificar "el filtro por categoría devuelve solo el curso publicado de esa categoría" $?
[ "$(echo "$cuerpo" | python3 -c "import sys,json; c=json.load(sys.stdin)['cursos'][0]; print(sorted(c)==sorted(['slug','titulo','subtitulo','nivel','categoria','categoria_slug','instructor','portada_ruta','secciones','clases']))")" = "True" ]; verificar "la tarjeta no trae campos internos" $?
for q in "anatomia" "ANATOM%C3%8DA" "Anatom%C3%ADa" "cuerpo" "Usuario%20instructor_a"; do
  solicitar GET "/escuela/cursos?q=$q"
  [ "$(echo "$cuerpo" | python3 -c "import sys,json; print(any(c['slug']=='$SLUG_A' for c in json.load(sys.stdin)['cursos']))")" = "True" ]; verificar "buscar '$q' encuentra el curso" $?
done
solicitar GET "/escuela/cursos?q=zzzinexistente"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total']==0 and d['cursos']==[] and d['paginas']==0)")" = "True" ]; verificar "una búsqueda sin resultados devuelve la lista vacía" $?
solicitar GET "/escuela/cursos?nivel=avanzado&categoria=$(psql_n8n "select slug from escuela.categorias where id = $ID_CAT")"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")" = "0" ]; verificar "el filtro de nivel reduce el resultado" $?
for i in $(seq 1 12); do
  psql_n8n "insert into escuela.cursos (slug, instructor_id, titulo, estado, publicado_en, nivel, categoria_id) values ('prueba-esc-$SUFIJO-extra-$i', '$ID_A', 'Prueba esc $SUFIJO curso extra $i', 'publicado', now() - interval '$i minutes', 'basico', $ID_CAT)" > /dev/null
done
SLUG_CAT="$(psql_n8n "select slug from escuela.categorias where id = $ID_CAT")"
solicitar GET "/escuela/cursos?categoria=$SLUG_CAT"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total']==13 and d['paginas']==2 and len(d['cursos'])==12 and d['cursos'][0]['slug']=='$SLUG_A')")" = "True" ]; verificar "con 13 cursos publicados hay 2 páginas de 12 y el más reciente va primero" $?
solicitar GET "/escuela/cursos?categoria=$SLUG_CAT&pagina=2"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pagina']==2 and len(d['cursos'])==1)")" = "True" ]; verificar "la página 2 trae el curso restante" $?
solicitar GET "/escuela/cursos?categoria=$SLUG_CAT&pagina=3"
cuerpo_tiene '"cursos":[]' "una página fuera de rango devuelve la lista vacía"
for malo in "nivel=experto" "pagina=0" "pagina=abc" "extra=1" "q=$(head -c 120 /dev/zero | tr '\0' a)"; do
  solicitar GET "/escuela/cursos?$malo"
  estado_es 422 "cursos con '${malo:0:20}' -> 422"
done
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_B" > /dev/null
solicitar GET "/escuela/cursos?q=Fisiolog%C3%ADa"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; print(all('Fisiolog' not in c['titulo'] for c in json.load(sys.stdin)['cursos']))")" = "True" ]; verificar "un curso en borrador no aparece en el catálogo" $?
solicitar GET "/escuela/curso?slug=$SLUG_A"
estado_es 200 "la ficha de un curso publicado -> 200"
echo "$cuerpo" | python3 escuela/pruebas/sin_campos_internos.py "$SLUG_CAT" basico "Sección extra"; verificar "la ficha trae categoría, nivel y temario, y ningún campo interno" $?
solicitar GET "/escuela/curso?slug=prueba-esc-$SUFIJO-fisiologia"
estado_es 404 "la ficha de un curso en borrador -> 404"
solicitar GET "/escuela/curso?slug=no-existe-$SUFIJO"
estado_es 404 "la ficha de un curso inexistente -> 404"
solicitar GET "/escuela/curso"
estado_es 422 "la ficha sin slug -> 422"
api POST /escuela/admin/retirar-curso "$TOKEN_admin" "{\"curso_id\":$CURSO_A,\"comentario\":\"Prueba de retiro\"}"
solicitar GET "/escuela/curso?slug=$SLUG_A"
estado_es 404 "un curso retirado desaparece de la ficha pública"
solicitar GET "/escuela/cursos?categoria=$SLUG_CAT"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")" = "12" ]; verificar "un curso retirado desaparece del catálogo" $?

echo "== Equipo de apoyo: invitaciones"
ultimo_correo() { # <destinatario> <asunto|texto|html>
  curl -s -G "$MAILPIT/api/v1/search" --data-urlencode "query=to:$1" | python3 -c "
import sys, json, urllib.request
d = json.load(sys.stdin)
if not d['messages']: sys.exit(0)
m = d['messages'][0]
c = json.load(urllib.request.urlopen('$MAILPIT/api/v1/message/' + m['ID']))
print({'asunto': m['Subject'], 'texto': c['Text'], 'html': c['HTML']}['$2'])"
}
crear_usuario invitado
ID_INV="$(id_de "$CORREO_invitado")"
CORREO_SINVER="prueba_esc_${SUFIJO}_sinverificar@example.com"
publicar_json /autenticacion/registro "{\"correo\":\"$CORREO_SINVER\",\"nombre\":\"Sin Verificar\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
INVITAR="/escuela/invitar-equipo"
api POST $INVITAR "$TOKEN_invitado" "{\"correo\":\"$CORREO_estudiante\"}"
estado_es 403 "invitar-equipo sin rol instructor -> 403"
solicitar POST $INVITAR -H 'Content-Type: application/json' -d '{"correo":"a@b.co"}'
estado_es 401 "invitar-equipo sin token -> 401"
api POST $INVITAR "$TOKEN_instructor_a" '{"correo":"no-es-correo"}'
estado_es 422 "invitar-equipo con un correo mal formado -> 422"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"nadie_$SUFIJO@example.com\"}"
estado_es 404 "invitar a un correo sin cuenta -> 404"
cuerpo_tiene '"USUARIO_NO_REGISTRADO"' "correo sin cuenta -> USUARIO_NO_REGISTRADO"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_SINVER\"}"
cuerpo_tiene '"USUARIO_NO_REGISTRADO"' "una cuenta sin verificar tampoco se puede invitar"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_instructor_a\"}"
estado_es 409 "invitarse a uno mismo -> 409"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_miembro\"}"
estado_es 409 "invitar a quien ya está en el equipo -> 409"
cuerpo_tiene '"YA_ES_MIEMBRO"' "ya es miembro -> YA_ES_MIEMBRO"
curl -s -X DELETE "$MAILPIT/api/v1/messages" > /dev/null
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_invitado\"}"
estado_es 201 "invitar-equipo a una cuenta verificada -> 201"
cuerpo_tiene '"correo_enviado":true' "la respuesta confirma el envío del correo"
INV_1="$(campo_json id)"
esperar_correo "$CORREO_invitado"
[[ "$(ultimo_correo "$CORREO_invitado" asunto)" == *"te invitó a su equipo de apoyo"* ]]; verificar "el correo llega con el asunto en español" $?
CORREO_HTML="$(ultimo_correo "$CORREO_invitado" html)"
[[ "$CORREO_HTML" == *"Usuario instructor_a"* && "$CORREO_HTML" != *"http"* && "$CORREO_HTML" != *"href"* ]]; verificar "el correo nombra al instructor y no lleva enlaces" $?
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_invitado\"}"
estado_es 409 "una segunda invitación vigente -> 409"
cuerpo_tiene '"INVITACION_DUPLICADA"' "invitación repetida -> INVITACION_DUPLICADA"
api GET /escuela/mi-equipo "$TOKEN_estudiante"
estado_es 403 "mi-equipo sin rol instructor -> 403"
api GET /escuela/mi-equipo "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['miembros'])==1 and d['miembros'][0]['miembro_id']=='$ID_MIEMBRO' and [i['correo'] for i in d['invitaciones']]==['$CORREO_invitado'])")" = "True" ]; verificar "mi-equipo lista al miembro y la invitación pendiente" $?
api GET /escuela/mis-invitaciones "$TOKEN_invitado"
estado_es 200 "mis-invitaciones -> 200"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; i=json.load(sys.stdin)['invitaciones']; print(len(i)==1 and i[0]['id']==$INV_1 and i[0]['instructor']=='Usuario instructor_a')")" = "True" ]; verificar "el invitado ve la invitación con el nombre del instructor" $?
api GET /escuela/mis-invitaciones "$TOKEN_estudiante"
cuerpo_tiene '"invitaciones":[]' "otra cuenta no ve invitaciones ajenas"
solicitar GET /escuela/mis-invitaciones
estado_es 401 "mis-invitaciones sin token -> 401"
api POST /escuela/responder-invitacion "$TOKEN_estudiante" "{\"invitacion_id\":$INV_1,\"aceptar\":true}"
estado_es 404 "responder una invitación ajena -> 404"
api POST /escuela/cancelar-invitacion "$TOKEN_instructor_b" "{\"invitacion_id\":$INV_1}"
estado_es 404 "cancelar la invitación de otro instructor -> 404"
api POST /escuela/cancelar-invitacion "$TOKEN_estudiante" "{\"invitacion_id\":$INV_1}"
estado_es 403 "cancelar-invitacion sin rol instructor -> 403"
api POST /escuela/cancelar-invitacion "$TOKEN_instructor_a" "{\"invitacion_id\":$INV_1}"
estado_es 204 "cancelar-invitacion -> 204"
api POST /escuela/responder-invitacion "$TOKEN_invitado" "{\"invitacion_id\":$INV_1,\"aceptar\":true}"
estado_es 404 "responder una invitación cancelada -> 404"
api POST /escuela/cancelar-invitacion "$TOKEN_instructor_a" "{\"invitacion_id\":$INV_1}"
estado_es 404 "cancelar dos veces -> 404"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_invitado\"}"
estado_es 201 "se puede invitar de nuevo tras cancelar"
INV_2="$(campo_json id)"
api POST /escuela/responder-invitacion "$TOKEN_invitado" "{\"invitacion_id\":$INV_2,\"aceptar\":false}"
estado_es 200 "rechazar una invitación -> 200"
api GET /escuela/mis-roles "$TOKEN_invitado"
cuerpo_tiene '"roles":[]' "rechazar no da ningún rol"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_invitado\"}"
INV_3="$(campo_json id)"
psql_n8n "update escuela.invitaciones_equipo set expira_en = now() - interval '1 minute' where id = $INV_3" > /dev/null
api GET /escuela/mis-invitaciones "$TOKEN_invitado"
cuerpo_tiene '"invitaciones":[]' "una invitación vencida deja de aparecer"
api POST /escuela/responder-invitacion "$TOKEN_invitado" "{\"invitacion_id\":$INV_3,\"aceptar\":true}"
estado_es 404 "responder una invitación vencida -> 404"
api POST $INVITAR "$TOKEN_instructor_a" "{\"correo\":\"$CORREO_invitado\"}"
estado_es 201 "tras vencer, el instructor puede invitar de nuevo"
INV_4="$(campo_json id)"
[ "$(psql_n8n "select estado from escuela.invitaciones_equipo where id = $INV_3")" = "cancelada" ]; verificar "la invitación vencida quedó cerrada" $?

echo "== Equipo de apoyo: aceptar, permisos y quitar"
api POST /escuela/guardar-seccion "$TOKEN_invitado" "{\"curso_id\":$CURSO_A,\"titulo\":\"Antes de aceptar\"}"
estado_es 403 "sin aceptar, la persona invitada no edita el temario (403)"
api POST /escuela/responder-invitacion "$TOKEN_invitado" "{\"invitacion_id\":$INV_4,\"aceptar\":true}"
estado_es 200 "aceptar una invitación -> 200"
cuerpo_tiene '"aceptada":true' "la respuesta confirma que se aceptó"
api POST /escuela/responder-invitacion "$TOKEN_invitado" "{\"invitacion_id\":$INV_4,\"aceptar\":true}"
estado_es 404 "responder dos veces -> 404"
api GET /escuela/mis-roles "$TOKEN_invitado"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['roles']==['equipo_apoyo'] and d['equipos'][0]['instructor_id']=='$ID_A')")" = "True" ]; verificar "aceptar da el rol equipo_apoyo y lista el equipo" $?
api POST /escuela/guardar-seccion "$TOKEN_invitado" "{\"curso_id\":$CURSO_A,\"titulo\":\"Sección del equipo\"}"
estado_es 200 "el nuevo miembro edita el temario"
SEC_EQ="$(campo_json id)"
api POST /escuela/editar-curso "$TOKEN_invitado" "{\"curso_id\":$CURSO_A,\"nivel\":\"basico\"}"
estado_es 403 "el miembro no edita los datos del curso"
api POST /escuela/invitar-equipo "$TOKEN_invitado" "{\"correo\":\"$CORREO_estudiante\"}"
estado_es 403 "el miembro no invita a otras personas"
api POST /escuela/quitar-miembro "$TOKEN_instructor_b" "{\"miembro_id\":\"$ID_INV\"}"
estado_es 404 "quitar a alguien que no es de tu equipo -> 404"
api POST /escuela/quitar-miembro "$TOKEN_estudiante" "{\"miembro_id\":\"$ID_INV\"}"
estado_es 403 "quitar-miembro sin rol instructor -> 403"
psql_n8n "insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('$ID_B', '$ID_MIEMBRO')" > /dev/null
api POST /escuela/quitar-miembro "$TOKEN_instructor_a" "{\"miembro_id\":\"$ID_MIEMBRO\"}"
estado_es 204 "quitar-miembro -> 204"
api GET /escuela/mis-roles "$TOKEN_miembro"
cuerpo_tiene '"equipo_apoyo"' "quien sigue en el equipo de otro instructor conserva el rol equipo_apoyo"
api POST /escuela/quitar-miembro "$TOKEN_instructor_b" "{\"miembro_id\":\"$ID_MIEMBRO\"}"
api GET /escuela/mis-roles "$TOKEN_miembro"
cuerpo_tiene '"roles":[]' "al salir del último equipo se pierde el rol equipo_apoyo"
api POST /escuela/quitar-miembro "$TOKEN_instructor_a" "{\"miembro_id\":\"$ID_INV\"}"
estado_es 204 "el instructor quita al miembro invitado"
api POST /escuela/guardar-seccion "$TOKEN_invitado" "{\"curso_id\":$CURSO_A,\"titulo\":\"Después de salir\"}"
estado_es 403 "quitado del equipo, ya no edita el temario (403)"
api POST /escuela/quitar-miembro "$TOKEN_instructor_a" "{\"miembro_id\":\"$ID_INV\"}"
estado_es 404 "quitar dos veces -> 404"

echo "== Videos: datos"
psql_n8n "insert into escuela.cursos (id, slug, instructor_id, titulo) values (990001, 'prueba-esc-videos-$SUFIJO', '$ID_A', 'Prueba esc videos'); insert into escuela.secciones (id, curso_id, titulo, posicion) values (990001, 990001, 'S', 1); insert into escuela.clases (id, seccion_id, titulo, posicion) values (990001, 990001, 'C', 1)" > /dev/null
insertar_video() { psql_n8n "insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, ruta_base) values (990001, '$1', $2, 'a.mp4', '${3:-video/mp4}', ${4:-10}, 'x')" 2>&1; }
[[ "$(insertar_video listo true)" == "INSERT 0 1" ]]; verificar "un primer video vigente se inserta" $?
[[ "$(insertar_video listo true)" == *videos_vigente_unico* ]]; verificar "un segundo video vigente en la misma clase lo rechaza la base" $?
[[ "$(insertar_video en_cola false)" == "INSERT 0 1" ]]; verificar "un video en proceso se inserta junto al vigente" $?
[[ "$(insertar_video procesando false)" == *videos_en_proceso_unico* ]]; verificar "un segundo video en proceso en la misma clase lo rechaza la base" $?
[[ "$(insertar_video error false)" == "INSERT 0 1" && "$(insertar_video error false)" == "INSERT 0 1" ]]; verificar "varios videos en error conviven" $?
[[ "$(insertar_video error false video/avi)" == *tipo_contenido_check* ]]; verificar "un tipo distinto de MP4, MOV y WebM lo rechaza la base" $?
[[ "$(insertar_video error false video/mp4 1073741825)" == *tamano_bytes_check* ]]; verificar "más de 1 073 741 824 bytes lo rechaza la base" $?
ID_VID="$(psql_n8n "select id from escuela.videos_clase where estado = 'en_cola'")"
[[ "$(psql_n8n "insert into escuela.claves_video values ($ID_VID, decode('00112233445566778899aabbccddeeff','hex'))" 2>&1)" == "INSERT 0 1" ]]; verificar "una clave de 16 bytes se inserta" $?
[[ "$(psql_n8n "insert into escuela.claves_video values ($((ID_VID + 1)), decode('00112233445566778899aabbccddeeff00','hex'))" 2>&1)" == *claves_video_clave_check* ]]; verificar "una clave de 17 bytes la rechaza la base" $?
psql_n8n "delete from escuela.cursos where id = 990001" > /dev/null
[ "$(psql_n8n "select count(*) from escuela.claves_video where video_id = $ID_VID")" = "0" ]; verificar "borrar el curso borra en cascada sus videos y sus claves" $?

echo "== Videos: solicitar y confirmar la subida"
docker compose exec -T transcodificador ffmpeg -hide_banner -v error -y -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=440 -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac /trabajo/prueba_esc.mp4
docker compose cp transcodificador:/trabajo/prueba_esc.mp4 "$DIRECTORIO_TEMPORAL/clase.mp4" > /dev/null 2>&1
TAM="$(wc -c < "$DIRECTORIO_TEMPORAL/clase.mp4" | tr -d ' ')"
api POST /escuela/crear-curso "$TOKEN_instructor_a" "{\"titulo\":\"Prueba esc $SUFIJO Videos\"}"; CURSO_V="$(campo_json id)"; PREFIJOS_VIDEO+=("cursos/$CURSO_V")
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_V,\"titulo\":\"Sección de videos\"}"; SEC_V2="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_V2,\"titulo\":\"Clase con video\",\"es_muestra\":true}"; CLASE_V="$(campo_json id)"
psql_n8n "insert into escuela.roles_usuario (usuario_id, rol) values ('$ID_INV', 'equipo_apoyo') on conflict do nothing; insert into escuela.equipos_apoyo (instructor_id, miembro_id) values ('$ID_A', '$ID_INV') on conflict do nothing" > /dev/null
SOLICITAR="/escuela/solicitar-subida-video"
datos_video() { echo "{\"clase_id\":$CLASE_V,\"nombre_archivo\":\"clase.mp4\",\"tipo_contenido\":\"${1:-video/mp4}\",\"tamano_bytes\":${2:-$TAM}}"; }
solicitar POST $SOLICITAR -H 'Content-Type: application/json' -d "$(datos_video)"
estado_es 401 "solicitar-subida-video sin token -> 401"
api POST $SOLICITAR "$TOKEN_estudiante" "$(datos_video)"
estado_es 403 "solicitar-subida-video sin rol instructor ni equipo -> 403"
api POST $SOLICITAR "$TOKEN_instructor_b" "$(datos_video)"
estado_es 403 "solicitar-subida-video en una clase de un curso ajeno -> 403"
api POST $SOLICITAR "$TOKEN_instructor_a" "{\"clase_id\":99999999,\"nombre_archivo\":\"a.mp4\",\"tipo_contenido\":\"video/mp4\",\"tamano_bytes\":10}"
estado_es 404 "solicitar-subida-video en una clase inexistente -> 404"
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/avi)"
estado_es 422 "solicitar-subida-video con video/avi -> 422"
cuerpo_tiene '"VIDEO_INVALIDO"' "video/avi -> VIDEO_INVALIDO"
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/mp4 1073741825)"
estado_es 422 "solicitar-subida-video con 1 073 741 825 bytes -> 422"
cuerpo_tiene '"VIDEO_INVALIDO"' "más de 1 GiB -> VIDEO_INVALIDO"
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/mp4 0)"
estado_es 422 "solicitar-subida-video con 0 bytes -> 422"
api POST $SOLICITAR "$TOKEN_instructor_a" "{\"clase_id\":$CLASE_V,\"tipo_contenido\":\"video/mp4\",\"tamano_bytes\":10}"
estado_es 422 "solicitar-subida-video sin nombre_archivo -> 422"
api POST $SOLICITAR "$TOKEN_instructor_a" "${DATOS_X:-$(datos_video | sed 's/}$/,"extra":1}/')}"
estado_es 422 "solicitar-subida-video con un campo extra -> 422"
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_V" > /dev/null
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video)"
estado_es 409 "solicitar-subida-video en un curso en revisión -> 409"
cuerpo_tiene '"CURSO_EN_REVISION"' "curso en revisión -> CURSO_EN_REVISION"
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_V" > /dev/null
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/mp4 1073741824)"
estado_es 201 "solicitar-subida-video con exactamente 1 073 741 824 bytes -> 201"
VIDEO_EXACTO="$(campo_json video_id)"
psql_n8n "delete from escuela.videos_clase where id = $VIDEO_EXACTO" > /dev/null
api POST $SOLICITAR "$TOKEN_invitado" "$(datos_video)"
estado_es 201 "un miembro del equipo de apoyo puede solicitar la subida -> 201"
VIDEO_1="$(campo_json video_id)"; URL_V1="$(campo_json url_subida)"; RUTA_V1="$(campo_json ruta)"
[[ "$URL_V1" == /almacen/object/upload/sign/videos/cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_1/original.mp4?token=* && "$RUTA_V1" == cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_1/original.mp4 ]]; verificar "la URL firmada y la ruta siguen el orden curso/sección/clase/video" $?
[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_1")" = "esperando_archivo" ]; verificar "el video queda en esperando_archivo" $?
[ "$(psql_n8n "select octet_length(clave) from escuela.claves_video where video_id = $VIDEO_1")" = "16" ]; verificar "se guardó su clave AES-128 de 16 bytes" $?
CLAVE_HEX_V1="$(psql_n8n "select encode(clave,'hex') from escuela.claves_video where video_id = $VIDEO_1")"
cuerpo_no_tiene "$CLAVE_HEX_V1" "la respuesta no contiene la clave"
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video)"
estado_es 409 "una segunda solicitud con la primera sin terminar -> 409"
cuerpo_tiene '"VIDEO_EN_PROCESO"' "segunda solicitud -> VIDEO_EN_PROCESO"
CONFIRMAR="/escuela/confirmar-subida-video"
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_1}"
estado_es 422 "confirmar sin haber subido el archivo -> 422"
cuerpo_tiene '"VIDEO_INVALIDO"' "archivo no subido -> VIDEO_INVALIDO"
api POST $CONFIRMAR "$TOKEN_instructor_b" "{\"video_id\":$VIDEO_1}"
estado_es 403 "confirmar el video de un curso ajeno -> 403"
api POST $CONFIRMAR "$TOKEN_estudiante" "{\"video_id\":$VIDEO_1}"
estado_es 403 "confirmar sin rol -> 403"
api POST $CONFIRMAR "$TOKEN_instructor_a" '{"video_id":99999999}'
estado_es 404 "confirmar un video inexistente -> 404"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$ALMACEN${URL_V1#/almacen}" -H 'Content-Type: video/mp4' --data-binary "@$DIRECTORIO_TEMPORAL/clase.mp4")" = "200" ]; verificar "el navegador sube el archivo con la URL firmada (200)" $?
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_V" > /dev/null
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_1}"
estado_es 409 "confirmar en un curso en revisión -> 409"
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_V" > /dev/null
psql_n8n "update escuela.videos_clase set tamano_bytes = $TAM + 1 where id = $VIDEO_1" > /dev/null
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_1}"
estado_es 422 "confirmar un archivo que no coincide con el tamaño declarado -> 422"
psql_n8n "update escuela.videos_clase set tamano_bytes = $TAM where id = $VIDEO_1" > /dev/null
docker compose stop transcodificador > /dev/null 2>&1
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_1}"
estado_es 503 "con el transcodificador caído, confirmar -> 503"
cuerpo_tiene '"SERVICIO_NO_DISPONIBLE"' "transcodificador caído -> SERVICIO_NO_DISPONIBLE"
[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_1")" = "error" ]; verificar "el video queda en error cuando el servicio no responde" $?
docker compose start transcodificador > /dev/null 2>&1; sleep 4
psql_n8n "update escuela.videos_clase set estado = 'esperando_archivo', error = null where id = $VIDEO_1" > /dev/null
psql_n8n "update escuela.videos_clase set estado = 'esperando_archivo', error = null where id = $VIDEO_1" > /dev/null
api POST $CONFIRMAR "$TOKEN_invitado" "{\"video_id\":$VIDEO_1}"
estado_es 202 "un miembro del equipo confirma la subida -> 202"
cuerpo_tiene '"en_cola"' "la respuesta indica en_cola"
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_1}"
estado_es 409 "confirmar dos veces -> 409"
[[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_1")" =~ ^(en_cola|procesando|listo)$ ]]; verificar "el video pasó a la cola en la base (y puede estar ya procesado)" $?
ESTADO_TRABAJO="$(docker compose exec -T -e SEC="$(leer_env SECRETO_TRANSCODIFICADOR)" n8n node -e "fetch('http://transcodificador:8090/trabajos/$VIDEO_1',{headers:{'X-Secreto-Transcodificador':process.env.SEC}}).then(async r=>console.log(r.status))")"
[ "$ESTADO_TRABAJO" = "200" ]; verificar "el transcodificador recibió el trabajo (GET /trabajos/<id> -> 200)" $?

echo "== Videos: resultado, estado y reemplazo"
ESTADO_VIDEO="/escuela/estado-video"
solicitar GET "$ESTADO_VIDEO?clase_id=$CLASE_V"
estado_es 401 "estado-video sin token -> 401"
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_estudiante"
estado_es 403 "estado-video sin rol -> 403"
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_instructor_b"
estado_es 403 "estado-video de una clase de un curso ajeno -> 403"
api GET "$ESTADO_VIDEO?clase_id=99999999" "$TOKEN_instructor_a"
estado_es 404 "estado-video de una clase inexistente -> 404"
api GET "$ESTADO_VIDEO" "$TOKEN_instructor_a"
estado_es 422 "estado-video sin clase_id -> 422"
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V&extra=1" "$TOKEN_instructor_a"
estado_es 422 "estado-video con un parámetro extra -> 422"
# esperar_estado <token> <clase_id> <condición en Python sobre d>: sondea estado-video hasta 2 minutos
esperar_estado() {
  local n=0
  while [ "$n" -lt 60 ]; do
    api GET "$ESTADO_VIDEO?clase_id=$2" "$1"
    echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if ($3) else 1)" 2> /dev/null && return 0
    sleep 2; n=$((n + 1))
  done
  return 1
}
esperar_estado "$TOKEN_instructor_a" "$CLASE_V" "d['vigente'] and d['vigente']['estado'] == 'listo'"; verificar "el video termina en listo (el aviso del transcodificador llegó a n8n)" $?
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['vigente']['id'] == $VIDEO_1 and abs(d['vigente']['duracion_segundos'] - 4) <= 1 and d['nuevo'] is None and d['vigente']['listo_en'] is not None)")" = "True" ]; verificar "el vigente es el video 1, con su duración real (±1 s) y no hay video nuevo" $?
cuerpo_no_tiene "$CLAVE_HEX_V1" "estado-video no contiene la clave"
existe_video() { curl -s -o /dev/null -w '%{http_code}' "$ALMACEN/object/videos/$1" -H "Authorization: Bearer $(leer_env SERVICE_ROLE_KEY)" -H "apikey: $(leer_env SERVICE_ROLE_KEY)"; }
BASE_V1="cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_1"
[ "$(existe_video "$BASE_V1/hls/lista.m3u8")" = "200" ] && [ "$(existe_video "$BASE_V1/hls/segmento_00001.ts")" = "200" ]; verificar "la lista y los segmentos quedaron en la ruta ordenada del bucket" $?
[ "$(existe_video "$BASE_V1/original.mp4")" != "200" ]; verificar "el original se borró del bucket" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$ALMACEN/object/public/videos/$BASE_V1/hls/lista.m3u8")" != "200" ]; verificar "un visitante anónimo no puede leer el video (bucket privado)" $?
[ "$(psql_n8n "select vigente from escuela.videos_clase where id = $VIDEO_1")" = "t" ]; verificar "el video quedó marcado como vigente" $?
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_invitado"
estado_es 200 "un miembro del equipo consulta el estado -> 200"
llamar_aviso() { docker compose exec -T -e SEC="$1" -e CUERPO="$2" n8n node -e 'const cab={"Content-Type":"application/json"}; if (process.env.SEC) cab["X-Secreto-Transcodificador"]=process.env.SEC; fetch("http://localhost:5678/webhook/escuela/interno/video-procesado",{method:"POST",headers:cab,body:process.env.CUERPO}).then(async r=>console.log(r.status, await r.text()))'; }
SECRETO_T="$(leer_env SECRETO_TRANSCODIFICADOR)"
[[ "$(llamar_aviso "" "{\"video_id\":$VIDEO_1,\"resultado\":\"error\"}")" == 403* ]]; verificar "el webhook interno sin el secreto -> 403 (puerto 5678 directo)" $?
[[ "$(llamar_aviso "equivocado" "{\"video_id\":$VIDEO_1,\"resultado\":\"error\"}")" == 403* ]]; verificar "el webhook interno con un secreto equivocado -> 403" $?
[[ "$(llamar_aviso "$(leer_env SECRETO_PROXY)" "{\"video_id\":$VIDEO_1,\"resultado\":\"error\"}")" == 403* ]]; verificar "el secreto del proxy no sirve para el webhook interno -> 403" $?
[[ "$(llamar_aviso "$SECRETO_T" '{"video_id":99999999,"resultado":"listo","duracion_segundos":5}')" == '200 {"aplicado":false}' ]]; verificar "un aviso de un video inexistente se ignora (200 aplicado false)" $?
[[ "$(llamar_aviso "$SECRETO_T" "{\"video_id\":$VIDEO_1,\"resultado\":\"error\",\"mensaje\":\"tarde\"}")" == '200 {"aplicado":false}' ]]; verificar "un aviso de un video que ya está listo no lo cambia" $?
[[ "$(llamar_aviso "$SECRETO_T" '{"video_id":1,"resultado":"raro"}')" == 422* ]]; verificar "un aviso con un resultado inválido -> 422" $?
solicitar POST /escuela/interno/video-procesado -H 'Content-Type: application/json' -d '{"video_id":1,"resultado":"error"}'
estado_es 404 "por Caddy, /escuela/interno/video-procesado -> 404"
solicitar POST /webhook/escuela/interno/video-procesado -H 'Content-Type: application/json' -d '{"video_id":1,"resultado":"error"}'
estado_es 404 "por Caddy, /webhook/escuela/interno/video-procesado -> 404"
[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_1")" = "listo" ]; verificar "los avisos rechazados o ignorados no cambiaron el video" $?
# --- reemplazo: el anterior sigue vigente mientras el nuevo se procesa
docker compose exec -T transcodificador ffmpeg -hide_banner -v error -y -f lavfi -i testsrc2=size=1280x720:rate=25 -f lavfi -i sine=frequency=330 -t 90 -c:v libx264 -crf 32 -pix_fmt yuv420p -c:a aac /trabajo/larga_esc.mp4
docker compose cp transcodificador:/trabajo/larga_esc.mp4 "$DIRECTORIO_TEMPORAL/larga.mp4" > /dev/null 2>&1
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/mp4 "$(wc -c < "$DIRECTORIO_TEMPORAL/larga.mp4" | tr -d ' ')")"
VIDEO_2="$(campo_json video_id)"; URL_V2="$(campo_json url_subida)"
estado_es 201 "se puede solicitar otro video mientras el vigente está listo"
curl -s -o /dev/null -X PUT "$ALMACEN${URL_V2#/almacen}" -H 'Content-Type: video/mp4' --data-binary "@$DIRECTORIO_TEMPORAL/larga.mp4"
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_2}"
estado_es 202 "confirmar el video de reemplazo -> 202"
BASE_V2="cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_2"
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['vigente']['id'] == $VIDEO_1 and d['vigente']['estado'] == 'listo' and d['nuevo']['id'] == $VIDEO_2)")" = "True" ]; verificar "mientras el nuevo se procesa, el anterior sigue siendo el vigente" $?
esperar_estado "$TOKEN_instructor_a" "$CLASE_V" "d['vigente']['id'] == $VIDEO_2 and d['nuevo'] is None"; verificar "al quedar listo, el nuevo pasa a ser el único vigente" $?
[ "$(psql_n8n "select count(*) from escuela.videos_clase where clase_id = $CLASE_V and vigente")" = "1" ] && [ "$(psql_n8n "select count(*) from escuela.videos_clase where id = $VIDEO_1")" = "0" ]; verificar "queda un solo vigente y la fila del anterior se borró (con su clave)" $?
[ "$(existe_video "$BASE_V1/hls/lista.m3u8")" != "200" ] && [ "$(existe_video "$BASE_V1/hls/segmento_00001.ts")" != "200" ]; verificar "los archivos del video anterior ya no existen en Storage" $?
[ "$(existe_video "$BASE_V2/hls/lista.m3u8")" = "200" ]; verificar "los archivos del video nuevo sí existen" $?
# --- un archivo corrupto termina en error sin tocar el vigente
head -c 50000 /dev/urandom > "$DIRECTORIO_TEMPORAL/basura.mp4"
api POST $SOLICITAR "$TOKEN_instructor_a" "$(datos_video video/mp4 50000)"
VIDEO_3="$(campo_json video_id)"; URL_V3="$(campo_json url_subida)"
curl -s -o /dev/null -X PUT "$ALMACEN${URL_V3#/almacen}" -H 'Content-Type: video/mp4' --data-binary "@$DIRECTORIO_TEMPORAL/basura.mp4"
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_3}"
estado_es 202 "confirmar un archivo corrupto se acepta (se descubre al procesar)"
esperar_estado "$TOKEN_instructor_a" "$CLASE_V" "d['nuevo'] and d['nuevo']['estado'] == 'error'"; verificar "un archivo corrupto termina en error" $?
[ "$(echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print('dañado' in d['nuevo']['error'] and d['vigente']['id'] == $VIDEO_2)")" = "True" ]; verificar "el error es legible y el video vigente no cambió" $?
[ "$(existe_video "cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_3/original.mp4")" = "200" ]; verificar "con error el original se conserva en Storage" $?
# --- tiempo máximo de 45 minutos
psql_n8n "update escuela.videos_clase set estado = 'en_cola', error = null, actualizado_en = now() - interval '44 minutes' where id = $VIDEO_3" > /dev/null
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; print(json.load(sys.stdin)['nuevo']['estado'])")" = "en_cola" ]; verificar "con 44 minutos sin cambios el video sigue en cola" $?
psql_n8n "update escuela.videos_clase set actualizado_en = now() - interval '46 minutes' where id = $VIDEO_3" > /dev/null
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "import sys,json; n=json.load(sys.stdin)['nuevo']; print(n['estado'] == 'error' and n['error'] == 'El procesamiento tardó demasiado.')")" = "True" ]; verificar "con 46 minutos sin cambios pasa a error: El procesamiento tardó demasiado." $?

echo "== Videos: transcodificador colgado"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_V2,\"titulo\":\"Clase para el colgado\",\"es_muestra\":false}"; CLASE_V2="$(campo_json id)"
api POST $SOLICITAR "$TOKEN_instructor_a" "{\"clase_id\":$CLASE_V2,\"nombre_archivo\":\"clase.mp4\",\"tipo_contenido\":\"video/mp4\",\"tamano_bytes\":$TAM}"
VIDEO_C="$(campo_json video_id)"; URL_VC="$(campo_json url_subida)"
curl -s -o /dev/null -X PUT "$ALMACEN${URL_VC#/almacen}" -H 'Content-Type: video/mp4' --data-binary "@$DIRECTORIO_TEMPORAL/clase.mp4"
docker compose pause transcodificador > /dev/null 2>&1
INICIO=$SECONDS
api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_C}"
estado_es 503 "con el transcodificador colgado, confirmar -> 503 limpio (no 500)"
[ $((SECONDS - INICIO)) -lt 14 ]; verificar "el 503 llega antes del límite de 15 s del workflow (espera máxima de 10 s)" $?
[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_C")" = "error" ]; verificar "el video quedó en error" $?
docker compose unpause transcodificador > /dev/null 2>&1
n=0; until [[ "$(docker compose exec -T -e SEC="$SECRETO_T" n8n node -e "fetch('http://transcodificador:8090/trabajos/$VIDEO_C',{headers:{'X-Secreto-Transcodificador':process.env.SEC}}).then(async r=>console.log(r.status, await r.text()))")" =~ (listo|error) ]] || [ "$n" -ge 30 ]; do sleep 2; n=$((n + 1)); done
[ "$(psql_n8n "select estado from escuela.videos_clase where id = $VIDEO_C")" = "error" ]; verificar "el aviso tardío del trabajo retenido no revive un video que ya estaba en error" $?

echo "== Videos: reintentar, borrar y limpieza"
REINTENTAR="/escuela/reintentar-video"; BORRAR_VIDEO="/escuela/borrar-video"
solicitar POST $REINTENTAR -H 'Content-Type: application/json' -d "{\"video_id\":$VIDEO_3}"
estado_es 401 "reintentar-video sin token -> 401"
api POST $REINTENTAR "$TOKEN_estudiante" "{\"video_id\":$VIDEO_3}"
estado_es 403 "reintentar-video sin rol -> 403"
api POST $REINTENTAR "$TOKEN_instructor_b" "{\"video_id\":$VIDEO_3}"
estado_es 403 "reintentar-video de un curso ajeno -> 403"
api POST $REINTENTAR "$TOKEN_instructor_a" '{"video_id":99999999}'
estado_es 404 "reintentar-video de un video inexistente -> 404"
api POST $REINTENTAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_2}"
estado_es 409 "reintentar un video que ya está listo -> 409"
psql_n8n "update escuela.cursos set estado = 'en_revision' where id = $CURSO_V" > /dev/null
api POST $REINTENTAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_3}"
estado_es 409 "reintentar-video en un curso en revisión -> 409"
api POST $BORRAR_VIDEO "$TOKEN_instructor_a" "{\"clase_id\":$CLASE_V}"
estado_es 409 "borrar-video en un curso en revisión -> 409"
psql_n8n "update escuela.cursos set estado = 'borrador' where id = $CURSO_V" > /dev/null
psql_n8n "update escuela.videos_clase set estado = 'error', actualizado_en = now() where id = $VIDEO_3" > /dev/null
api POST $REINTENTAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_3}"
estado_es 202 "reintentar un video en error con su original -> 202"
esperar_estado "$TOKEN_instructor_a" "$CLASE_V" "d['nuevo'] and d['nuevo']['estado'] == 'error' and 'dañado' in d['nuevo']['error']"; verificar "el archivo corrupto vuelve a terminar en error tras el reintento" $?
curl -s -o /dev/null -X DELETE "$ALMACEN/object/videos/cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_3/original.mp4" -H "Authorization: Bearer $(leer_env SERVICE_ROLE_KEY)" -H "apikey: $(leer_env SERVICE_ROLE_KEY)"
api POST $REINTENTAR "$TOKEN_instructor_a" "{\"video_id\":$VIDEO_3}"
estado_es 422 "reintentar sin el original en Storage -> 422"
cuerpo_tiene "ya no está" "el mensaje pide subir el video otra vez"
# crear_video_listo <clase_id>: sube un video real, lo procesa y deja el id en LISTO_ID y su carpeta en LISTO_BASE
crear_video_listo() {
  api POST $SOLICITAR "$TOKEN_instructor_a" "{\"clase_id\":$1,\"nombre_archivo\":\"clase.mp4\",\"tipo_contenido\":\"video/mp4\",\"tamano_bytes\":$TAM}"
  LISTO_ID="$(campo_json video_id)"; LISTO_BASE="$(campo_json ruta)"; LISTO_BASE="${LISTO_BASE%/original.mp4}"
  curl -s -o /dev/null -X PUT "$ALMACEN$(campo_json url_subida | sed 's#^/almacen##')" -H 'Content-Type: video/mp4' --data-binary "@$DIRECTORIO_TEMPORAL/clase.mp4"
  api POST $CONFIRMAR "$TOKEN_instructor_a" "{\"video_id\":$LISTO_ID}" > /dev/null
  esperar_estado "$TOKEN_instructor_a" "$1" "d['vigente'] and d['vigente']['id'] == $LISTO_ID"
}
api POST $BORRAR_VIDEO "$TOKEN_estudiante" "{\"clase_id\":$CLASE_V}"
estado_es 403 "borrar-video sin rol -> 403"
api POST $BORRAR_VIDEO "$TOKEN_instructor_b" "{\"clase_id\":$CLASE_V}"
estado_es 403 "borrar-video de un curso ajeno -> 403"
api POST $BORRAR_VIDEO "$TOKEN_instructor_a" '{"clase_id":99999999}'
estado_es 404 "borrar-video de una clase inexistente -> 404"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_V2,\"titulo\":\"Clase sin video\",\"es_muestra\":false}"; CLASE_SIN="$(campo_json id)"
api POST $BORRAR_VIDEO "$TOKEN_instructor_a" "{\"clase_id\":$CLASE_SIN}"
estado_es 404 "borrar-video de una clase sin video -> 404"
api GET "/escuela/curso-edicion?id=$CURSO_V" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "
import sys,json
c={k['id']:k for s in json.load(sys.stdin)['secciones'] for k in s['clases']}[$CLASE_V]
print(c['video']['estado']=='listo' and c['video']['duracion_segundos'] is not None and c['video_nuevo']['estado']=='error')")" = "True" ]; verificar "curso-edicion muestra en cada clase su video vigente y el video nuevo con error" $?
cuerpo_no_tiene "$(psql_n8n "select encode(clave,'hex') from escuela.claves_video where video_id = $VIDEO_2")" "curso-edicion no contiene la clave de cifrado"
api GET "/escuela/curso-edicion?id=$CURSO_V" "$TOKEN_instructor_a"
[ "$(echo "$cuerpo" | python3 -c "
import sys,json
c={k['id']:k for s in json.load(sys.stdin)['secciones'] for k in s['clases']}[$CLASE_SIN]
print(c['video'] is None and c['video_nuevo'] is None)")" = "True" ]; verificar "una clase sin video muestra video y video_nuevo en null" $?
BASE_V2="cursos/$CURSO_V/secciones/$SEC_V2/clases/$CLASE_V/$VIDEO_2"
api POST $BORRAR_VIDEO "$TOKEN_invitado" "{\"clase_id\":$CLASE_V}"
estado_es 204 "un miembro del equipo borra el video de la clase (vigente y con error) -> 204"
[ "$(psql_n8n "select count(*) from escuela.videos_clase where clase_id = $CLASE_V")" = "0" ] && [ "$(psql_n8n "select count(*) from escuela.claves_video where video_id in ($VIDEO_2, $VIDEO_3)")" = "0" ]; verificar "se borraron las filas de la base y sus claves" $?
[ "$(existe_video "$BASE_V2/hls/lista.m3u8")" != "200" ] && [ "$(existe_video "$BASE_V2/hls/segmento_00001.ts")" != "200" ]; verificar "se borraron los archivos del video de Storage" $?
api GET "$ESTADO_VIDEO?clase_id=$CLASE_V" "$TOKEN_instructor_a"
cuerpo_tiene '"vigente":null,"nuevo":null' "estado-video de la clase sin videos -> vigente y nuevo en null"
# --- borrar-clase y borrar-seccion limpian los archivos
crear_video_listo "$CLASE_SIN"; verificar "un video real se procesa hasta quedar listo" $?
BASE_K="$LISTO_BASE"; ID_K="$LISTO_ID"
[ "$(existe_video "$BASE_K/hls/lista.m3u8")" = "200" ]; verificar "su lista HLS existe en Storage" $?
api POST /escuela/borrar-clase "$TOKEN_instructor_a" "{\"clase_id\":$CLASE_SIN}"
estado_es 204 "borrar-clase con video -> 204"
[ "$(existe_video "$BASE_K/hls/lista.m3u8")" != "200" ] && [ "$(psql_n8n "select count(*) from escuela.videos_clase where id = $ID_K")" = "0" ]; verificar "borrar-clase borra también los archivos y la fila de su video" $?
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_V,\"titulo\":\"Sección para borrar\"}"; SEC_B="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_B,\"titulo\":\"Clase de la sección\",\"es_muestra\":false}"; CLASE_B="$(campo_json id)"
crear_video_listo "$CLASE_B"; verificar "otro video real queda listo en una sección nueva" $?
BASE_S="$LISTO_BASE"; ID_S="$LISTO_ID"; PREFIJOS_VIDEO+=("cursos/$CURSO_V")
api POST /escuela/borrar-seccion "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_B}"
estado_es 204 "borrar-seccion con una clase con video -> 204"
[ "$(existe_video "$BASE_S/hls/lista.m3u8")" != "200" ] && [ "$(psql_n8n "select count(*) from escuela.videos_clase where id = $ID_S")" = "0" ]; verificar "borrar-seccion borra también los archivos de los videos de sus clases" $?
# --- enviar-revision exige un video listo en cada clase
api POST /escuela/crear-curso "$TOKEN_instructor_a" "{\"titulo\":\"Prueba esc $SUFIJO Revision con video\"}"; CURSO_W="$(campo_json id)"
api POST /escuela/editar-curso "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_W,\"subtitulo\":\"S\",\"descripcion\":\"D\",\"nivel\":\"basico\",\"categoria_id\":$ID_CAT}"
api POST /escuela/guardar-seccion "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_W,\"titulo\":\"Única\"}"; SEC_W="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_W,\"titulo\":\"Con video\",\"es_muestra\":false}"; CLASE_W1="$(campo_json id)"
api POST /escuela/guardar-clase "$TOKEN_instructor_a" "{\"seccion_id\":$SEC_W,\"titulo\":\"Sin video\",\"es_muestra\":false}"; CLASE_W2="$(campo_json id)"
psql_n8n "update escuela.cursos set portada_ruta = 'cursos/$CURSO_W/portada-prueba.png' where id = $CURSO_W" > /dev/null
poner_video_listo "$CLASE_W1"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_W}"
estado_es 422 "enviar a revisión con una clase sin video listo -> 422"
cuerpo_tiene '"falta_video"' "la falta es falta_video"
psql_n8n "insert into escuela.videos_clase (clase_id, estado, nombre_original, tipo_contenido, tamano_bytes, ruta_base) values ($CLASE_W2, 'en_cola', 'a.mp4', 'video/mp4', 10, 'x')" > /dev/null
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_W}"
cuerpo_tiene '"falta_video"' "un video en cola todavía no cuenta (falta_video)"
psql_n8n "delete from escuela.videos_clase where clase_id = $CLASE_W2" > /dev/null; poner_video_listo "$CLASE_W2"
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_W}"
estado_es 200 "con un video listo en cada clase el curso se envía a revisión -> 200"

echo
echo "$((total - fallos)) de $total casos correctos"

[ "$fallos" -eq 0 ]
