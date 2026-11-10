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

# Limpia solo lo creado por estas pruebas (usuarios prueba_esc_*) y deja intacto el resto de la escuela
limpiar_datos() {
  local ids
  borrar_portadas
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
psql_n8n "update escuela.cursos set portada_ruta = 'cursos/$CURSO_A/portada-prueba.png' where id = $CURSO_A" > /dev/null
api POST /escuela/enviar-revision "$TOKEN_instructor_a" "{\"curso_id\":$CURSO_A}"
estado_es 200 "enviar-revision de un curso completo -> 200"
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

echo
echo "$((total - fallos)) de $total casos correctos"
[ "$fallos" -eq 0 ]
