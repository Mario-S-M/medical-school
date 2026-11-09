#!/usr/bin/env bash
# Pruebas de la API de autenticación (SPEC 04). Se ejecutan desde la raíz del repo con el stack levantado:
#   bash auth/pruebas/pruebas.sh
# No contiene secretos: lee lo necesario de .env. Sale con código 1 si algún caso falla.
set -u

BASE="http://127.0.0.1:8080"
DIRECTORIO_TEMPORAL="$(mktemp -d)"
total=0
fallos=0

leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
ORIGEN_FRONT="$(leer_env ORIGEN_FRONT)"

psql_postgres() { docker compose exec -T db psql -U postgres -tAc "$1"; }
psql_n8n() {
  docker compose exec -T -e PGPASSWORD="$(leer_env CONTRASENA_BD_N8N)" db psql -h localhost -U "$(leer_env USUARIO_BD_N8N)" -d n8n -tAc "$1"
}
limpiar_datos() {
  psql_postgres "delete from auth.users where email like 'prueba_sh_%@example.com'" > /dev/null 2>&1
  psql_n8n "truncate autenticacion.intentos_inicio_sesion" > /dev/null 2>&1
  psql_n8n "truncate autenticacion.eventos_codigo" > /dev/null 2>&1
  curl -s -X DELETE http://127.0.0.1:8025/api/v1/messages > /dev/null 2>&1
}
trap 'limpiar_datos; rm -rf "$DIRECTORIO_TEMPORAL"' EXIT
limpiar_datos

# publicar_json <ruta> <cuerpo> [argumentos de curl...]  (con el Origin del front)
publicar_json() {
  local ruta="$1" datos="$2"; shift 2
  solicitar POST "$ruta" -H 'Content-Type: application/json' -H "Origin: $ORIGEN_FRONT" -d "$datos" "$@"
}
SUFIJO="$$_$RANDOM"

# campo_json <clave>: lee $cuerpo y imprime el valor de la clave (vacío si no existe)
campo_json() { echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }
# registrar_usuario <sufijo>: crea un usuario válido por la API y deja su correo en $CORREO_ACTUAL
CONTRASENA_VALIDA='Zorro#Azul-2026x'
registrar_usuario() {
  CORREO_ACTUAL="$(correo_nuevo "$1")"
  publicar_json /autenticacion/registro "{\"correo\":\"$CORREO_ACTUAL\",\"nombre\":\"Usuario $1\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
}
iniciar_sesion() { # <correo> <contraseña> [argumentos de curl...]
  local c="$1" k="$2"; shift 2
  publicar_json /autenticacion/iniciar-sesion "{\"correo\":\"$c\",\"contrasena\":\"$k\"}" "$@"
}
# valor_cookie: valor de token_renovacion en el Set-Cookie de la última respuesta
valor_cookie() { echo "$cabeceras" | grep -i '^set-cookie: token_renovacion=' | sed -E 's/^[^=]*=([^;]*);.*/\1/'; }
renovar_sesion() { # <valor de cookie o vacío>
  if [ -n "$1" ]; then
    solicitar POST /autenticacion/renovar -H "Origin: $ORIGEN_FRONT" -H 'X-Solicitado-Con: front' -H "Cookie: token_renovacion=$1"
  else
    solicitar POST /autenticacion/renovar -H "Origin: $ORIGEN_FRONT" -H 'X-Solicitado-Con: front'
  fi
}

# --- Mailpit (SPEC 05): los correos de Supabase Auth llegan a este buzón de pruebas ---
MAILPIT="http://127.0.0.1:8025"
vaciar_mailpit() { curl -s -X DELETE "$MAILPIT/api/v1/messages" > /dev/null; }
contar_correos() { # <destinatario>
  curl -s -G "$MAILPIT/api/v1/search" --data-urlencode "query=to:$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['messages_count'])"
}
# esperar_correos <destinatario> <cantidad>: espera (hasta 20 s) a que haya al menos esa cantidad
esperar_correos() {
  local n=0
  until [ "$(contar_correos "$1")" -ge "$2" ] || [ "$n" -ge 40 ]; do sleep 0.5; n=$((n + 1)); done
}
# ultimo_correo <destinatario> <campo>: asunto | texto | html del correo más reciente
ultimo_correo() {
  curl -s -G "$MAILPIT/api/v1/search" --data-urlencode "query=to:$1" | python3 -c "
import sys, json, urllib.request
d = json.load(sys.stdin)
if not d['messages']: sys.exit(0)
m = d['messages'][0]
c = json.load(urllib.request.urlopen('$MAILPIT/api/v1/message/' + m['ID']))
print({'asunto': m['Subject'], 'texto': c['Text'], 'html': c['HTML']}['$2'])"
}
# codigo_de_correo <destinatario>: código de 6 dígitos del correo más reciente (vacío si no hay)
codigo_de_correo() { ultimo_correo "$1" texto | grep -oE '\b[0-9]{6}\b' | head -1; }
limpiar_eventos() { psql_n8n "truncate autenticacion.eventos_codigo" > /dev/null; }
limpiar_intentos() { psql_n8n "truncate autenticacion.intentos_inicio_sesion" > /dev/null; }
correo_nuevo() { echo "prueba_sh_${SUFIJO}_$1@example.com"; }

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
cuerpo_no_tiene() { ! echo "$cuerpo" | grep -qF -- "$1"; verificar "$2" $?; }
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

echo "== Acceso directo a n8n sin pasar por Caddy"
for ruta in registro iniciar-sesion renovar cerrar-sesion yo recuperar restablecer; do  # se amplía con cada workflow nuevo
  metodo=POST; [ "$ruta" = yo ] && metodo=GET
  solicitar "$metodo" "/webhook/autenticacion/$ruta" -H 'Content-Type: application/json' -d '{}' --connect-timeout 3 2>/dev/null
  BASE_ORIGINAL="$BASE"; BASE="http://127.0.0.1:5678"
  solicitar "$metodo" "/webhook/autenticacion/$ruta" -H 'Content-Type: application/json' -d '{}'
  estado_es 403 "n8n directo sin secreto: $ruta -> 403"
  solicitar "$metodo" "/webhook/autenticacion/$ruta" -H 'Content-Type: application/json' -H 'X-Secreto-Proxy: incorrecto' -d '{}'
  estado_es 403 "n8n directo con secreto incorrecto: $ruta -> 403"
  BASE="$BASE_ORIGINAL"
done

echo "== Registro"
CORREO_A="$(correo_nuevo a)"
publicar_json /autenticacion/registro "{\"correo\":\"$(echo "$CORREO_A" | tr 'a-z' 'A-Z' | sed 's/@EXAMPLE.COM/@Example.com/')\",\"nombre\":\"Ana Prueba\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
estado_es 201 "registro válido -> 201"
cuerpo_tiene '"mensaje"' "registro válido -> mensaje"
cuerpo_no_tiene "$CONTRASENA_VALIDA" "la respuesta no contiene la contraseña"
cuerpo_primero="$cuerpo"
fila="$(psql_postgres "select email || '|' || coalesce(raw_user_meta_data->>'nombre','') from auth.users where email = '$CORREO_A'")"
[ "$fila" = "$CORREO_A|Ana Prueba" ]; verificar "auth.users: correo en minúsculas y nombre guardado" $?
publicar_json /autenticacion/registro "{\"correo\":\"$CORREO_A\",\"nombre\":\"Ana Prueba\",\"contrasena\":\"$CONTRASENA_VALIDA\"}"
estado_es 201 "registro duplicado -> 201"
[ "$cuerpo" = "$cuerpo_primero" ]; verificar "registro duplicado: cuerpo idéntico al primero" $?
[ "$(psql_postgres "select count(*) from auth.users where email = '$CORREO_A'")" = "1" ]; verificar "registro duplicado: una sola fila en auth.users" $?

# contraseña que incumple una sola regla -> 422 CONTRASENA_INSEGURA con esa regla
regla_unica() { # <contraseña> <regla> <descripción>
  publicar_json /autenticacion/registro "{\"correo\":\"$(correo_nuevo zacarias.t)\",\"nombre\":\"Z\",\"contrasena\":\"$1\"}"
  [ "$estado" = "422" ] && echo "$cuerpo" | grep -q '"CONTRASENA_INSEGURA"' && echo "$cuerpo" | grep -qF "\"regla\":\"$2\""
  verificar "contraseña $3 -> CONTRASENA_INSEGURA ($2)" $?
}
regla_unica 'Aa1!bcdefg' minimo_12_caracteres "de menos de 12 caracteres"
regla_unica 'zorro#azul-2026x' requiere_mayuscula "sin mayúscula"
regla_unica 'ZORRO#AZUL-2026X' requiere_minuscula "sin minúscula"
regla_unica 'Zorro#Azul-Verde' requiere_numero "sin número"
regla_unica 'ZorroAzul20261x' requiere_simbolo "sin símbolo"
regla_unica ' Zorro#Azul-2026x' sin_espacios_extremos "con espacio al inicio"
regla_unica 'Zorro#Azul-2026x ' sin_espacios_extremos "con espacio al final"
regla_unica "Zorro#Azul-2026x$(printf 'a%.0s' $(seq 1 60))" maximo_72_bytes "de más de 72 bytes"
PARTE_LOCAL="$(correo_nuevo zacarias.t | cut -d@ -f1)"
regla_unica "Aa1#$PARTE_LOCAL" no_contiene_correo "que contiene el correo"
regla_unica 'Password123!' no_es_comun "común"
publicar_json /autenticacion/registro "{\"correo\":\"$(correo_nuevo carlos)\",\"nombre\":\"C\",\"contrasena\":\"c\"}"
for regla in minimo_12_caracteres requiere_mayuscula requiere_numero requiere_simbolo; do
  cuerpo_tiene "\"regla\":\"$regla\"" "contraseña con varias fallas lista también $regla"
done
[ "$(psql_postgres "select count(*) from auth.users where email like 'prueba_sh_${SUFIJO}_%' and email <> '$CORREO_A'")" = "0" ]; verificar "las contraseñas rechazadas no crearon usuarios" $?

# validación de campos
caso_validacion() { # <cuerpo> <descripción>
  publicar_json /autenticacion/registro "$1"
  [ "$estado" = "422" ] && echo "$cuerpo" | grep -q '"VALIDACION_FALLIDA"'; verificar "$2 -> 422 VALIDACION_FALLIDA" $?
}
publicar_json /autenticacion/registro '{"correo":'
estado_es 400 "JSON roto -> 400"
cuerpo_tiene '"JSON_INVALIDO"' "JSON roto -> JSON_INVALIDO"
caso_validacion "{\"correo\":\"no-es-un-correo\",\"nombre\":\"N\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "correo mal formado"
caso_validacion "{\"correo\":\"$(printf 'a%.0s' $(seq 1 250))@example.com\",\"nombre\":\"N\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "correo de más de 254 caracteres"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"nombre\":\"\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "nombre vacío"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"nombre\":\"$(printf 'n%.0s' $(seq 1 81))\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "nombre de más de 80 caracteres"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"nombre\":\"Con\\u0007control\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "nombre con caracteres de control"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"nombre\":\"N\",\"contrasena\":12345678901234}" "contraseña de tipo incorrecto"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"contrasena\":\"$CONTRASENA_VALIDA\"}" "campo faltante"
caso_validacion "{\"correo\":\"$(correo_nuevo n)\",\"nombre\":\"N\",\"contrasena\":\"$CONTRASENA_VALIDA\",\"rol\":\"admin\"}" "campo extra"
caso_validacion '[1,2]' "cuerpo que no es un objeto"

echo "== Inicio de sesión"
limpiar_intentos
registrar_usuario sesion
CORREO_SESION="$CORREO_ACTUAL"
iniciar_sesion "$CORREO_SESION" "$CONTRASENA_VALIDA"
estado_es 200 "inicio de sesión válido -> 200"
cabecera_tiene "Set-Cookie: token_renovacion=" "inicio de sesión: cookie token_renovacion"
for atributo in HttpOnly SameSite=Strict Path=/autenticacion Max-Age=604800; do
  cabecera_tiene "$atributo" "cookie con $atributo"
done
cabecera_no_tiene 'set-cookie:.*secure' "cookie sin Secure (queda para la spec de TLS)"
TOKEN_ACCESO="$(campo_json token_acceso)"
[ -n "$TOKEN_ACCESO" ]; verificar "cuerpo con token_acceso" $?
[ "$(campo_json tipo_token)" = "Bearer" ]; verificar "tipo_token = Bearer" $?
[ "$(campo_json expira_en)" = "900" ]; verificar "expira_en = 900" $?
VALOR_COOKIE="$(echo "$cabeceras" | grep -i '^set-cookie:' | sed -E 's/^[^=]*=([^;]*);.*/\1/')"
cuerpo_no_tiene "$VALOR_COOKIE" "el token de renovación no aparece en el cuerpo"
echo "$cuerpo" | python3 -c "import sys,json; u=json.load(sys.stdin)['usuario']; assert set(u)=={'id','correo','nombre'} and u['correo']=='$CORREO_SESION' and u['nombre']=='Usuario sesion'"; verificar "usuario { id, correo, nombre } correcto" $?
JWT_SECRET="$(leer_env JWT_SECRET)" python3 - "$TOKEN_ACCESO" <<'PY'
import sys, os, hmac, hashlib, base64, json
t = sys.argv[1]; h, p, s = t.split('.')
firma = base64.urlsafe_b64encode(hmac.new(os.environ['JWT_SECRET'].encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
d = json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))
assert json.loads(base64.urlsafe_b64decode(h + '=' * (-len(h) % 4)))['alg'] == 'HS256'
assert firma == s and d['role'] == 'authenticated' and d['exp'] - d['iat'] == 900
PY
verificar "JWT: firma HS256 válida, role authenticated y exp - iat = 900" $?

iniciar_sesion "$CORREO_SESION" "incorrecta-Aa1!"
estado_es 401 "contraseña incorrecta -> 401"
cuerpo_mala="$cuerpo"
iniciar_sesion "esto-no-es-un-correo" "incorrecta-Aa1!"
estado_es 422 "correo mal formado -> 422"
iniciar_sesion "$(correo_nuevo inexistente)" "incorrecta-Aa1!"
estado_es 401 "correo inexistente -> 401"
cuerpo_tiene '"CREDENCIALES_INVALIDAS"' "correo inexistente -> CREDENCIALES_INVALIDAS"
[ "$cuerpo" = "$cuerpo_mala" ]; verificar "correo inexistente y contraseña incorrecta: cuerpos idénticos" $?
publicar_json /autenticacion/iniciar-sesion "{\"correo\":\"$CORREO_SESION\"}"
estado_es 422 "campo faltante -> 422"
publicar_json /autenticacion/iniciar-sesion "{\"correo\":\"$CORREO_SESION\",\"contrasena\":\"x\",\"extra\":1}"
estado_es 422 "campo extra -> 422"
publicar_json /autenticacion/iniciar-sesion "{\"correo\":\"$CORREO_SESION\",\"contrasena\":123}"
estado_es 422 "contraseña de tipo incorrecto -> 422"
publicar_json /autenticacion/iniciar-sesion '{"correo":'
estado_es 400 "JSON roto -> 400"

echo "== Bloqueo por cuenta"
limpiar_intentos
registrar_usuario bloqueo
CORREO_BLOQUEO="$CORREO_ACTUAL"
for i in 1 2 3 4 5; do iniciar_sesion "$CORREO_BLOQUEO" "incorrecta-$i-Aa!"; done
iniciar_sesion "$CORREO_BLOQUEO" "$CONTRASENA_VALIDA"
estado_es 429 "6.º intento con la contraseña correcta -> 429"
cuerpo_tiene '"CUENTA_BLOQUEADA"' "6.º intento -> CUENTA_BLOQUEADA"
cabecera_tiene "Retry-After:" "6.º intento: cabecera Retry-After"
[ "$(campo_json error | python3 -c "import sys,ast; print(ast.literal_eval(sys.stdin.read())['reintentar_en_segundos'] > 0)")" = "True" ]; verificar "reintentar_en_segundos mayor que 0" $?
CORREO_FANTASMA="$(correo_nuevo fantasma)"
for i in 1 2 3 4 5; do iniciar_sesion "$CORREO_FANTASMA" "incorrecta-$i-Aa!"; done
iniciar_sesion "$CORREO_FANTASMA" "incorrecta-6-Aa!"
estado_es 429 "correo inexistente también se bloquea a los 5 fallos"
cuerpo_tiene '"CUENTA_BLOQUEADA"' "correo inexistente -> CUENTA_BLOQUEADA"
psql_n8n "update autenticacion.intentos_inicio_sesion set creado_en = creado_en - interval '16 minutes'" > /dev/null
iniciar_sesion "$CORREO_BLOQUEO" "$CONTRASENA_VALIDA"
estado_es 200 "pasados 15 minutos vuelve a poder iniciar sesión"
iniciar_sesion "$CORREO_BLOQUEO" "incorrecta-9-Aa!"
iniciar_sesion "$CORREO_BLOQUEO" "$CONTRASENA_VALIDA"
estado_es 200 "un fallo aislado no bloquea y un inicio correcto reinicia la cuenta"

echo "== Límite por IP y cabeceras falseadas"
limpiar_intentos
iniciar_sesion "$(correo_nuevo suplantado)" "incorrecta-Aa1!" -H 'X-Forwarded-For: 1.2.3.4' -H 'X-IP-Cliente: 9.9.9.9' -H 'X-Secreto-Proxy: falso'
estado_es 401 "cabeceras falseadas por el cliente no alteran la respuesta"
[ "$(psql_n8n "select count(*) from autenticacion.intentos_inicio_sesion where ip in ('1.2.3.4','9.9.9.9')")" = "0" ]; verificar "la IP guardada no es la que mandó el cliente" $?
# el intento con cabeceras falseadas fue el 1.º fallo de esta IP
for i in $(seq 1 18); do iniciar_sesion "$(correo_nuevo "ip$i")" "incorrecta-Aa1!"; done
iniciar_sesion "$(correo_nuevo ip19)" "incorrecta-Aa1!"
estado_es 401 "el intento 20 de la IP todavía se evalúa (401)"
iniciar_sesion "$(correo_nuevo ip20)" "incorrecta-Aa1!"
estado_es 429 "el intento 21 desde la misma IP -> 429"
cuerpo_tiene '"DEMASIADOS_INTENTOS"' "intento 21 -> DEMASIADOS_INTENTOS"
cabecera_tiene "Retry-After:" "intento 21: cabecera Retry-After"
limpiar_intentos

echo "== Renovar sesión"
limpiar_intentos
registrar_usuario renovar
iniciar_sesion "$CORREO_ACTUAL" "$CONTRASENA_VALIDA"
COOKIE_1="$(valor_cookie)"
renovar_sesion "$COOKIE_1"
estado_es 200 "renovar con la cookie -> 200"
COOKIE_2="$(valor_cookie)"
[ -n "$COOKIE_2" ] && [ "$COOKIE_2" != "$COOKIE_1" ]; verificar "renovar devuelve una cookie distinta (rotación)" $?
for atributo in HttpOnly SameSite=Strict Path=/autenticacion Max-Age=604800; do
  cabecera_tiene "$atributo" "renovar: cookie con $atributo"
done
[ -n "$(campo_json token_acceso)" ] && [ "$(campo_json expira_en)" = "900" ]; verificar "renovar devuelve token_acceso con expira_en = 900" $?
cuerpo_no_tiene "$COOKIE_2" "renovar: el token de renovación no aparece en el cuerpo"
renovar_sesion ""
estado_es 401 "renovar sin cookie -> 401"
cuerpo_tiene '"TOKEN_INVALIDO"' "renovar sin cookie -> TOKEN_INVALIDO"
renovar_sesion "tokeninventado123"
estado_es 401 "renovar con cookie inválida -> 401"
cabecera_tiene "Max-Age=0" "renovar con cookie inválida: la cookie se borra"
solicitar POST /autenticacion/renovar -H 'Origin: http://malo.example' -H 'X-Solicitado-Con: front' -H "Cookie: token_renovacion=$COOKIE_2"
estado_es 403 "renovar con Origin ajeno -> 403"
solicitar POST /autenticacion/renovar -H "Origin: $ORIGEN_FRONT" -H "Cookie: token_renovacion=$COOKIE_2"
estado_es 403 "renovar sin X-Solicitado-Con -> 403"
# Supabase Auth devuelve el mismo sucesor si la cookie vieja se reusa antes de consumir el nuevo, y tolera
# reusos dentro de 10 s (pestañas simultáneas); el reuso se detecta con el sucesor consumido y fuera del intervalo.
renovar_sesion "$COOKIE_2"
estado_es 200 "renovar con la cookie rotada (consume el sucesor) -> 200"
COOKIE_3="$(valor_cookie)"
echo "  (esperando 11 s: intervalo de reutilización de 10 s de Supabase Auth)"
sleep 11
renovar_sesion "$COOKIE_1"
estado_es 401 "reusar una cookie ya rotada y consumida -> 401"
cuerpo_tiene '"TOKEN_INVALIDO"' "reusar una cookie ya rotada y consumida -> TOKEN_INVALIDO"
cabecera_tiene "Max-Age=0" "reuso detectado: la cookie se borra"

echo "== Quién soy y cierre de sesión"
limpiar_intentos
registrar_usuario sesion2
CORREO_YO="$CORREO_ACTUAL"
iniciar_sesion "$CORREO_YO" "$CONTRASENA_VALIDA"
TOKEN_YO="$(campo_json token_acceso)"
COOKIE_YO="$(valor_cookie)"
consultar_yo() { solicitar GET /autenticacion/yo -H "Origin: $ORIGEN_FRONT" "$@"; }
consultar_yo -H "Authorization: Bearer $TOKEN_YO"
estado_es 200 "yo con token válido -> 200"
echo "$cuerpo" | python3 -c "import sys,json; d=json.load(sys.stdin); assert set(d)=={'id','correo','nombre'} and d['correo']=='$CORREO_YO' and d['nombre']=='Usuario sesion2'"; verificar "yo devuelve solo { id, correo, nombre }" $?
consultar_yo
estado_es 401 "yo sin token -> 401"
cuerpo_tiene '"TOKEN_INVALIDO"' "yo sin token -> TOKEN_INVALIDO"
consultar_yo -H "Authorization: Bearer ${TOKEN_YO%?}x"
estado_es 401 "yo con token manipulado -> 401"
consultar_yo -H "Authorization: Basic $TOKEN_YO"
estado_es 401 "yo con esquema distinto de Bearer -> 401"
TOKEN_EXPIRADO="$(JWT_SECRET="$(leer_env JWT_SECRET)" python3 - <<'PY'
import os, hmac, hashlib, base64, json, time, uuid
b = lambda d: base64.urlsafe_b64encode(d).rstrip(b'=').decode()
h = b(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
p = b(json.dumps({'sub': str(uuid.uuid4()), 'role': 'authenticated', 'aud': 'authenticated', 'iat': int(time.time()) - 1000, 'exp': int(time.time()) - 100, 'session_id': str(uuid.uuid4())}).encode())
print(f"{h}.{p}.{b(hmac.new(os.environ['JWT_SECRET'].encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())}")
PY
)"
consultar_yo -H "Authorization: Bearer $TOKEN_EXPIRADO"
estado_es 401 "yo con token expirado -> 401"

solicitar POST /autenticacion/cerrar-sesion -H "Origin: $ORIGEN_FRONT"
estado_es 401 "cerrar sesión sin token -> 401"
solicitar POST /autenticacion/cerrar-sesion -H "Origin: $ORIGEN_FRONT" -H "Authorization: Bearer $TOKEN_YO" -H "Cookie: token_renovacion=$COOKIE_YO"
estado_es 204 "cerrar sesión con token válido -> 204"
cabecera_tiene "Max-Age=0" "cerrar sesión: la cookie se borra"
cabecera_tiene "Set-Cookie: token_renovacion=;" "cerrar sesión: cookie token_renovacion vacía"
consultar_yo -H "Authorization: Bearer $TOKEN_YO"
estado_es 401 "tras cerrar sesión, el token de acceso anterior ya no pasa yo"
renovar_sesion "$COOKIE_YO"
estado_es 401 "tras cerrar sesión, la cookie anterior ya no renueva"

echo "== Recuperar contraseña"
limpiar_eventos; vaciar_mailpit
solicitar GET /autenticacion/recuperar
estado_es 405 "GET recuperar -> 405"
solicitar POST /autenticacion/recuperar -H 'Content-Type: text/plain' -d x
estado_es 415 "POST recuperar con text/plain -> 415"
registrar_usuario recuperar
CORREO_REC="$CORREO_ACTUAL"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_REC\"}"
estado_es 202 "recuperar de un correo registrado -> 202"
cuerpo_registrado="$cuerpo"
CORREO_FANTASMA_REC="$(correo_nuevo fantasma_rec)"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_FANTASMA_REC\"}"
estado_es 202 "recuperar de un correo inexistente -> 202"
[ "$cuerpo" = "$cuerpo_registrado" ]; verificar "recuperar: mismo cuerpo exista o no el correo" $?
esperar_correos "$CORREO_REC" 1
[ "$(contar_correos "$CORREO_REC")" = "1" ]; verificar "Mailpit recibe un solo correo para la cuenta registrada" $?
[ -n "$(codigo_de_correo "$CORREO_REC")" ]; verificar "el correo trae un código de 6 dígitos" $?
ultimo_correo "$CORREO_REC" asunto | grep -qi 'recuperar'; verificar "el asunto está en español (recuperar la contraseña)" $?
! ultimo_correo "$CORREO_REC" html | grep -qE 'https?://|href='; verificar "el correo no trae enlaces" $?
sleep 2
[ "$(contar_correos "$CORREO_FANTASMA_REC")" = "0" ]; verificar "no llega correo a un correo inexistente" $?
publicar_json /autenticacion/recuperar '{"correo":"no-es-un-correo"}'
estado_es 422 "recuperar con correo mal formado -> 422"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_REC\",\"extra\":1}"
estado_es 422 "recuperar con campo extra -> 422"
publicar_json /autenticacion/recuperar '{}'
estado_es 422 "recuperar sin correo -> 422"
publicar_json /autenticacion/recuperar '{"correo":'
estado_es 400 "recuperar con JSON roto -> 400"

echo "== Límites de solicitud de código"
limpiar_eventos
LIMITE_CORREO="$(correo_nuevo limite_rec)"
for i in 1 2 3; do publicar_json /autenticacion/recuperar "{\"correo\":\"$LIMITE_CORREO\"}"; done
estado_es 202 "3.ª solicitud del mismo correo -> 202"
publicar_json /autenticacion/recuperar "{\"correo\":\"$LIMITE_CORREO\"}"
estado_es 429 "4.ª solicitud del mismo correo (inexistente) -> 429"
cuerpo_tiene '"DEMASIADOS_INTENTOS"' "4.ª solicitud -> DEMASIADOS_INTENTOS"
cabecera_tiene "Retry-After:" "4.ª solicitud: cabecera Retry-After"
limpiar_eventos
for i in $(seq 1 10); do publicar_json /autenticacion/recuperar "{\"correo\":\"$(correo_nuevo "ip_rec_$i")\"}"; done
estado_es 202 "solicitud 10 de la misma IP -> 202"
publicar_json /autenticacion/recuperar "{\"correo\":\"$(correo_nuevo ip_rec_11)\"}"
estado_es 429 "solicitud 11 de la misma IP -> 429"
cuerpo_tiene '"DEMASIADOS_INTENTOS"' "solicitud 11 de la IP -> DEMASIADOS_INTENTOS"
limpiar_eventos

echo "== Restablecer contraseña"
limpiar_eventos; vaciar_mailpit
solicitar GET /autenticacion/restablecer
estado_es 405 "GET restablecer -> 405"
solicitar POST /autenticacion/restablecer -H 'Content-Type: text/plain' -d x
estado_es 415 "POST restablecer con text/plain -> 415"
restablecer() { # <correo> <código> <contraseña nueva>
  publicar_json /autenticacion/restablecer "{\"correo\":\"$1\",\"codigo\":\"$2\",\"contrasena_nueva\":\"$3\"}"
}
CONTRASENA_NUEVA='Otra#Clave-2026y'
registrar_usuario restablecer
CORREO_RES="$CORREO_ACTUAL"
iniciar_sesion "$CORREO_RES" "$CONTRASENA_VALIDA"
TOKEN_RES="$(campo_json token_acceso)"; COOKIE_RES="$(valor_cookie)"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_RES\"}"
esperar_correos "$CORREO_RES" 1
CODIGO_RES="$(codigo_de_correo "$CORREO_RES")"
[ -n "$CODIGO_RES" ]; verificar "se obtuvo el código de Mailpit" $?

restablecer "$CORREO_RES" "$CODIGO_RES" 'corta'
estado_es 422 "restablecer con contraseña débil -> 422"
cuerpo_tiene '"CONTRASENA_INSEGURA"' "contraseña débil -> CONTRASENA_INSEGURA"
cuerpo_tiene '"regla":"minimo_12_caracteres"' "contraseña débil: lista la regla incumplida"
restablecer "$CORREO_RES" "$CODIGO_RES" 'Password123!'
cuerpo_tiene '"regla":"no_es_comun"' "contraseña común rechazada en restablecer"
restablecer "$CORREO_RES" "$CODIGO_RES" "$(echo "$CORREO_RES" | cut -d@ -f1)#Aa1"
cuerpo_tiene '"regla":"no_contiene_correo"' "contraseña con el correo rechazada en restablecer"

restablecer "$CORREO_RES" "000000" "$CONTRASENA_NUEVA"
estado_es 400 "código erróneo -> 400"
cuerpo_tiene '"CODIGO_INVALIDO"' "código erróneo -> CODIGO_INVALIDO"
cuerpo_codigo_malo="$cuerpo"
restablecer "$(correo_nuevo fantasma_res)" "000000" "$CONTRASENA_NUEVA"
estado_es 400 "correo inexistente -> 400"
[ "$cuerpo" = "$cuerpo_codigo_malo" ]; verificar "código erróneo y correo inexistente: cuerpos idénticos" $?

publicar_json /autenticacion/restablecer "{\"correo\":\"$CORREO_RES\",\"codigo\":\"12345\",\"contrasena_nueva\":\"$CONTRASENA_NUEVA\"}"
estado_es 422 "código de 5 dígitos -> 422"
publicar_json /autenticacion/restablecer "{\"correo\":\"$CORREO_RES\",\"codigo\":\"abcdef\",\"contrasena_nueva\":\"$CONTRASENA_NUEVA\"}"
estado_es 422 "código con letras -> 422"
cuerpo_tiene '"VALIDACION_FALLIDA"' "código con letras -> VALIDACION_FALLIDA"
publicar_json /autenticacion/restablecer "{\"correo\":\"$CORREO_RES\",\"codigo\":123456,\"contrasena_nueva\":\"$CONTRASENA_NUEVA\"}"
estado_es 422 "código de tipo incorrecto -> 422"
publicar_json /autenticacion/restablecer "{\"correo\":\"$CORREO_RES\",\"codigo\":\"$CODIGO_RES\"}"
estado_es 422 "campo faltante -> 422"
publicar_json /autenticacion/restablecer "{\"correo\":\"$CORREO_RES\",\"codigo\":\"$CODIGO_RES\",\"contrasena_nueva\":\"$CONTRASENA_NUEVA\",\"extra\":1}"
estado_es 422 "campo extra -> 422"
publicar_json /autenticacion/restablecer '{"correo":'
estado_es 400 "JSON roto -> 400"

restablecer "$CORREO_RES" "$CODIGO_RES" "$CONTRASENA_NUEVA"
estado_es 200 "restablecer con el código correcto -> 200 (el código seguía vigente tras los rechazos)"
cuerpo_tiene '"mensaje"' "restablecer correcto -> mensaje"
iniciar_sesion "$CORREO_RES" "$CONTRASENA_NUEVA"
estado_es 200 "iniciar sesión con la contraseña nueva -> 200"
iniciar_sesion "$CORREO_RES" "$CONTRASENA_VALIDA"
estado_es 401 "iniciar sesión con la contraseña vieja -> 401"
renovar_sesion "$COOKIE_RES"
estado_es 401 "la cookie de una sesión abierta antes ya no renueva"
solicitar GET /autenticacion/yo -H "Origin: $ORIGEN_FRONT" -H "Authorization: Bearer $TOKEN_RES"
estado_es 401 "el token de acceso de una sesión abierta antes ya no pasa yo"
esperar_correos "$CORREO_RES" 2
ultimo_correo "$CORREO_RES" asunto | grep -qi 'cambiada'; verificar "llega el aviso de contraseña cambiada" $?
restablecer "$CORREO_RES" "$CODIGO_RES" "$CONTRASENA_NUEVA"
estado_es 400 "reusar el mismo código -> 400"
cuerpo_tiene '"CODIGO_INVALIDO"' "reusar el mismo código -> CODIGO_INVALIDO"

echo "== Código vencido y bloqueo por códigos erróneos"
registrar_usuario vencido
CORREO_VENCIDO="$CORREO_ACTUAL"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_VENCIDO\"}"
esperar_correos "$CORREO_VENCIDO" 1
CODIGO_VENCIDO="$(codigo_de_correo "$CORREO_VENCIDO")"
psql_postgres "update auth.users set recovery_sent_at = now() - interval '16 minutes' where email = '$CORREO_VENCIDO'" > /dev/null
restablecer "$CORREO_VENCIDO" "$CODIGO_VENCIDO" "$CONTRASENA_NUEVA"
estado_es 400 "código vencido (16 min) -> 400"
cuerpo_tiene '"CODIGO_INVALIDO"' "código vencido -> CODIGO_INVALIDO"

limpiar_eventos
registrar_usuario bloqueo_codigo
CORREO_BC="$CORREO_ACTUAL"
publicar_json /autenticacion/recuperar "{\"correo\":\"$CORREO_BC\"}"
esperar_correos "$CORREO_BC" 1
CODIGO_BC="$(codigo_de_correo "$CORREO_BC")"
for i in 1 2 3 4 5; do restablecer "$CORREO_BC" "00000$i" "$CONTRASENA_NUEVA"; done
restablecer "$CORREO_BC" "$CODIGO_BC" "$CONTRASENA_NUEVA"
estado_es 429 "6.º intento con el código correcto tras 5 erróneos -> 429"
cuerpo_tiene '"CODIGO_BLOQUEADO"' "6.º intento -> CODIGO_BLOQUEADO"
cabecera_tiene "Retry-After:" "6.º intento: cabecera Retry-After"
CORREO_FANTASMA_BC="$(correo_nuevo fantasma_bc)"
for i in 1 2 3 4 5; do restablecer "$CORREO_FANTASMA_BC" "00000$i" "$CONTRASENA_NUEVA"; done
restablecer "$CORREO_FANTASMA_BC" "000006" "$CONTRASENA_NUEVA"
estado_es 429 "un correo inexistente también se bloquea tras 5 códigos erróneos"
limpiar_eventos
for i in $(seq 1 20); do restablecer "$(correo_nuevo "ip_err_$i")" "000000" "$CONTRASENA_NUEVA"; done
estado_es 400 "código erróneo 20 de la IP todavía se evalúa (400)"
restablecer "$(correo_nuevo ip_err_21)" "000000" "$CONTRASENA_NUEVA"
estado_es 429 "código erróneo 21 de la IP -> 429"
cuerpo_tiene '"DEMASIADOS_INTENTOS"' "código erróneo 21 de la IP -> DEMASIADOS_INTENTOS"
limpiar_eventos

echo "== Ejecuciones y secretos"
for valor_env in SECRETO_PROXY JWT_SECRET CONTRASENA_BD_N8N POSTGRES_PASSWORD SERVICE_ROLE_KEY; do
  valor="$(leer_env "$valor_env")"
  [ -z "$(grep -rlF -- "$valor" auth .env.example 2>/dev/null)" ]; verificar "ningún archivo de auth/ ni .env.example contiene $valor_env" $?
done
CORREO_OWNER="$(psql_n8n 'select email from "user" order by "createdAt" limit 1')"
[ -n "$CORREO_OWNER" ] && [ -z "$(grep -rlF -- "$CORREO_OWNER" auth .env.example 2>/dev/null)" ]; verificar "ningún archivo de auth/ ni .env.example contiene el email del owner" $?
IDS="'autRegistro01','autInicioSesion01','autRenovarSesion01','autQuienSoy01','autCierreSesion01','autRecuperar01','autRestablecer01'"
echo "  (esperando el borrado definitivo de ejecuciones de n8n, hasta 2 minutos)"
intentos=0
until [ "$(psql_n8n "select (select count(*) from execution_entity where \"workflowId\" in ($IDS)) + (select count(*) from execution_data d join execution_entity e on e.id = d.\"executionId\" where e.\"workflowId\" in ($IDS))")" = "0" ] || [ "$intentos" -ge 40 ]; do
  sleep 3; intentos=$((intentos + 1))
done
[ "$(psql_n8n "select count(*) from execution_entity where \"workflowId\" in ($IDS)")" = "0" ]; verificar "execution_entity sin filas de los cinco workflows" $?
[ "$(psql_n8n "select count(*) from execution_data d join execution_entity e on e.id = d.\"executionId\" where e.\"workflowId\" in ($IDS)")" = "0" ]; verificar "execution_data sin filas de los cinco workflows" $?
[ "$(psql_n8n "select count(*) from execution_data where data like '%${CONTRASENA_VALIDA}%'")" = "0" ]; verificar "ninguna contraseña de las pruebas aparece en execution_data" $?

echo
echo "Casos: $total, fallos: $fallos"
[ "$fallos" -eq 0 ]
