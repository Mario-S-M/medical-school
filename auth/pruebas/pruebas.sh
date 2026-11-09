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
for ruta in registro iniciar-sesion; do  # se amplía con cada workflow nuevo
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

echo
echo "Casos: $total, fallos: $fallos"
[ "$fallos" -eq 0 ]
