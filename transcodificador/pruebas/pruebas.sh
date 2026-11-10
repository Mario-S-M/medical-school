#!/usr/bin/env bash
# Pruebas del transcodificador (SPEC 08). Desde la raíz del repo, con el stack levantado:
#   bash transcodificador/pruebas/pruebas.sh
# Genera sus videos con el ffmpeg del propio contenedor, los sube a un curso de prueba del bucket "videos"
# (cursos/9001/...) y lo borra todo al terminar. No contiene secretos: los lee de .env. Sale con código 1 si algo falla.
set -u

DIRECTORIO_TEMPORAL="$(mktemp -d)"
total=0; fallos=0
leer_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
CLAVE_SERVICIO="$(leer_env SERVICE_ROLE_KEY)"
SECRETO="$(leer_env SECRETO_TRANSCODIFICADOR)"
ALMACEN="http://127.0.0.1:$(leer_env KONG_HTTP_PORT)/storage/v1"
BASE_PRUEBA="cursos/9001/secciones/1/clases/1"
IDS=()

limpiar() {
  for id in "${IDS[@]:-}"; do
    [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$ALMACEN/object/videos" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" \
      -H 'Content-Type: application/json' -d "{\"prefixes\":$(listar_rutas "$id")}"
  done
  docker compose exec -T transcodificador sh -c 'rm -rf /trabajo/*' > /dev/null 2>&1
  rm -rf "$DIRECTORIO_TEMPORAL"
}
trap limpiar EXIT

verificar() { total=$((total + 1)); if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FALLA $1"; fallos=$((fallos + 1)); fi; }

# listar_rutas <video_id>: lista JSON de los objetos que quedan bajo la ruta del video
listar_rutas() {
  python3 - "$ALMACEN" "$CLAVE_SERVICIO" "$BASE_PRUEBA/$1" <<'PY'
import json, sys, urllib.request
almacen, clave, prefijo = sys.argv[1:4]
def listar(p):
    peticion = urllib.request.Request(f"{almacen}/object/list/videos", method="POST", data=json.dumps({"prefix": p, "limit": 1000}).encode(),
                                      headers={"Authorization": f"Bearer {clave}", "apikey": clave, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(peticion))
rutas = []
for e in listar(prefijo):
    if e.get("id"): rutas.append(f"{prefijo}/{e['name']}")
    else: rutas += [f"{prefijo}/{e['name']}/{h['name']}" for h in listar(f"{prefijo}/{e['name']}") if h.get("id")]
print(json.dumps(rutas))
PY
}

# api <método> <ruta> [secreto] [cuerpo]: llama al transcodificador DESDE el contenedor de n8n; imprime "estado cuerpo"
api() {
  docker compose exec -T -e METODO="$1" -e RUTA="$2" -e SEC="${3-$SECRETO}" -e CUERPO="${4:-}" n8n node -e '
    const cab = { "Content-Type": "application/json" };
    if (process.env.SEC) cab["X-Secreto-Transcodificador"] = process.env.SEC;
    fetch("http://transcodificador:8090" + process.env.RUTA, { method: process.env.METODO, headers: cab, body: process.env.CUERPO || undefined })
      .then(async (r) => console.log(r.status, await r.text()));'
}

# generar_video <nombre> <ffmpeg args...>: crea /trabajo/<nombre>.mp4 en el contenedor y lo copia al directorio temporal
generar_video() {
  local nombre="$1"; shift
  docker compose exec -T transcodificador ffmpeg -hide_banner -v error -y "$@" "/trabajo/$nombre.mp4"
  docker compose cp "transcodificador:/trabajo/$nombre.mp4" "$DIRECTORIO_TEMPORAL/$nombre.mp4" > /dev/null 2>&1
}

# subir_original <video_id> <archivo>: sube el archivo como original del video con una URL firmada
subir_original() {
  local ruta="$BASE_PRUEBA/$1/original.mp4" url
  url="$(curl -s -X POST "$ALMACEN/object/upload/sign/videos/$ruta" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")"
  curl -s -o /dev/null -X PUT "$ALMACEN$url" -H 'Content-Type: video/mp4' --data-binary "@$2"
  IDS+=("$1")
}

# lanzar <video_id> <clave_hex>: encola el trabajo y imprime "estado cuerpo"
lanzar() { api POST /trabajos "$SECRETO" "{\"video_id\":$1,\"ruta_original\":\"$BASE_PRUEBA/$1/original.mp4\",\"ruta_base\":\"$BASE_PRUEBA/$1\",\"clave_hex\":\"$2\"}"; }

# esperar <video_id>: espera hasta 3 minutos a que el trabajo termine y deja el estado en $ESTADO_FINAL y el mensaje en $MENSAJE_FINAL
esperar() {
  local n=0 r
  while [ "$n" -lt 90 ]; do
    r="$(api GET "/trabajos/$1")"
    ESTADO_FINAL="$(echo "${r#* }" | python3 -c "import sys,json; print(json.load(sys.stdin).get('estado',''))" 2> /dev/null)"
    MENSAJE_FINAL="$(echo "${r#* }" | python3 -c "import sys,json; print(json.load(sys.stdin).get('mensaje',''))" 2> /dev/null)"
    case "$ESTADO_FINAL" in listo | error) return ;; esac
    sleep 2; n=$((n + 1))
  done
}

existe() { curl -s -o /dev/null -w '%{http_code}' "$ALMACEN/object/videos/$1" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO"; }
alto_de() { docker compose exec -T transcodificador ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$1" | grep -m1 -E "^[0-9]+" | tr -d "\r"; }

echo "== Aislamiento y autenticación"
[ "$(docker compose exec -T n8n node -e 'fetch("http://transcodificador:8090/salud").then(async r=>console.log(r.status, await r.text()))')" = '200 {"listo": true}' ]; verificar "/salud responde 200 desde el contenedor de n8n" $?
[ -z "$(docker compose port transcodificador 8090 2> /dev/null | grep -v ':0$')" ]; verificar "el puerto 8090 no está publicado en el host" $?
[ "$(docker compose exec -T transcodificador id -u)" = "10001" ]; verificar "el servicio corre con un usuario sin privilegios" $?
docker compose exec -T transcodificador sh -c 'touch /app/x' > /dev/null 2>&1; [ $? -ne 0 ]; verificar "el sistema de archivos es de solo lectura" $?
[ "$(docker inspect "$(docker compose ps -q transcodificador)" --format '{{.HostConfig.Memory}}')" = "2147483648" ]; verificar "el límite de memoria es de 2 GB" $?
docker compose exec -T transcodificador ffmpeg -hide_banner -encoders 2> /dev/null | grep -q " libx264 " && docker compose exec -T transcodificador ffmpeg -hide_banner -encoders 2> /dev/null | grep -q " aac "; verificar "ffmpeg incluye libx264 y aac" $?
CUERPO_OK="{\"video_id\":1,\"ruta_original\":\"$BASE_PRUEBA/1/original.mp4\",\"ruta_base\":\"$BASE_PRUEBA/1\",\"clave_hex\":\"00112233445566778899aabbccddeeff\"}"
[[ "$(api POST /trabajos "" "$CUERPO_OK")" == 403* ]]; verificar "POST /trabajos sin el secreto -> 403" $?
[[ "$(api POST /trabajos "equivocado" "$CUERPO_OK")" == 403* ]]; verificar "POST /trabajos con un secreto equivocado -> 403" $?
[[ "$(api GET /trabajos/1 "")" == 403* ]]; verificar "GET /trabajos sin el secreto -> 403" $?
[[ "$(api POST /trabajos "$SECRETO" '{"video_id":1}')" == 422* ]]; verificar "datos incompletos -> 422" $?
[[ "$(api POST /trabajos "$SECRETO" "${CUERPO_OK%\}},\"extra\":1}")" == 422* ]]; verificar "un campo extra -> 422" $?
[[ "$(api POST /trabajos "$SECRETO" "${CUERPO_OK/clave_hex\":\"00/clave_hex\":\"zz}")" == 422* ]]; verificar "una clave que no es hexadecimal -> 422" $?
[[ "$(api POST /trabajos "$SECRETO" "${CUERPO_OK/\/1\/original/\/..\/..\/original}")" == 422* ]]; verificar "una ruta fuera de la ruta base -> 422" $?
[[ "$(api GET /trabajos/424242)" == 404* ]]; verificar "un trabajo desconocido -> 404" $?

echo "== Video de 1080p"
CLAVE_1="00112233445566778899aabbccddeeff"
generar_video p1080 -f lavfi -i testsrc2=size=1920x1080:rate=25 -f lavfi -i sine=frequency=440 -t 10 -c:v libx264 -pix_fmt yuv420p -c:a aac
subir_original 101 "$DIRECTORIO_TEMPORAL/p1080.mp4"
[[ "$(lanzar 101 $CLAVE_1)" == 202* ]]; verificar "POST /trabajos -> 202" $?
[[ "$(lanzar 101 $CLAVE_1)" == 409* ]]; verificar "el mismo video mientras sigue en la cola -> 409" $?
esperar 101
[ "$ESTADO_FINAL" = "listo" ]; verificar "el trabajo termina en listo" $?
[ "$(existe "$BASE_PRUEBA/101/hls/lista.m3u8")" = "200" ]; verificar "la lista m3u8 está en la ruta ordenada del bucket" $?
[ "$(existe "$BASE_PRUEBA/101/hls/segmento_00001.ts")" = "200" ]; verificar "hay segmentos TS en la ruta ordenada" $?
[ "$(existe "$BASE_PRUEBA/101/original.mp4")" != "200" ]; verificar "el original se borró al terminar bien" $?
curl -s "$ALMACEN/object/videos/$BASE_PRUEBA/101/hls/lista.m3u8" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" > "$DIRECTORIO_TEMPORAL/lista.m3u8"
grep -q '#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x' "$DIRECTORIO_TEMPORAL/lista.m3u8"; verificar "la lista declara AES-128, el marcador URI=\"clave\" y un IV" $?
[ "$(grep -c '^segmento_.*\.ts$' "$DIRECTORIO_TEMPORAL/lista.m3u8")" -ge 2 ] && grep -q '#EXT-X-TARGETDURATION:6' "$DIRECTORIO_TEMPORAL/lista.m3u8"; verificar "los segmentos son de 6 s (TARGETDURATION 6)" $?
curl -s "$ALMACEN/object/videos/$BASE_PRUEBA/101/hls/segmento_00001.ts" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" > "$DIRECTORIO_TEMPORAL/segmento.ts"
docker compose cp "$DIRECTORIO_TEMPORAL/segmento.ts" transcodificador:/trabajo/segmento.ts > /dev/null 2>&1
docker compose exec -T transcodificador ffprobe -v error "/trabajo/segmento.ts" > /dev/null 2>&1; [ $? -ne 0 ]; verificar "un segmento tal cual no es un TS válido (está cifrado)" $?
IV="$(grep -o 'IV=0x[0-9a-f]*' "$DIRECTORIO_TEMPORAL/lista.m3u8" | cut -c6-)"
openssl aes-128-cbc -d -K "$CLAVE_1" -iv "$IV" -in "$DIRECTORIO_TEMPORAL/segmento.ts" -out "$DIRECTORIO_TEMPORAL/descifrado.ts" 2> /dev/null
docker compose cp "$DIRECTORIO_TEMPORAL/descifrado.ts" transcodificador:/trabajo/descifrado.ts > /dev/null 2>&1
[ "$(alto_de /trabajo/descifrado.ts)" = "720" ]; verificar "descifrado con la clave y el IV de la lista es un TS válido y su alto es 720 (de 1080)" $?

echo "== Video de 360p"
generar_video p360 -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=440 -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac
subir_original 102 "$DIRECTORIO_TEMPORAL/p360.mp4"
lanzar 102 ffeeddccbbaa99887766554433221100 > /dev/null; esperar 102
[ "$ESTADO_FINAL" = "listo" ]; verificar "un video de 360p también termina en listo" $?
curl -s "$ALMACEN/object/videos/$BASE_PRUEBA/102/hls/segmento_00001.ts" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" > "$DIRECTORIO_TEMPORAL/s2.ts"
curl -s "$ALMACEN/object/videos/$BASE_PRUEBA/102/hls/lista.m3u8" -H "Authorization: Bearer $CLAVE_SERVICIO" -H "apikey: $CLAVE_SERVICIO" > "$DIRECTORIO_TEMPORAL/l2.m3u8"
openssl aes-128-cbc -d -K ffeeddccbbaa99887766554433221100 -iv "$(grep -o 'IV=0x[0-9a-f]*' "$DIRECTORIO_TEMPORAL/l2.m3u8" | cut -c6-)" -in "$DIRECTORIO_TEMPORAL/s2.ts" -out "$DIRECTORIO_TEMPORAL/d2.ts" 2> /dev/null
docker compose cp "$DIRECTORIO_TEMPORAL/d2.ts" transcodificador:/trabajo/d2.ts > /dev/null 2>&1
[ "$(alto_de /trabajo/d2.ts)" = "360" ]; verificar "un original de 360p no se amplía (sale de 360)" $?

echo "== Casos de error"
head -c 200000 /dev/urandom > "$DIRECTORIO_TEMPORAL/roto.mp4"
subir_original 103 "$DIRECTORIO_TEMPORAL/roto.mp4"
lanzar 103 00112233445566778899aabbccddeeff > /dev/null; esperar 103
[ "$ESTADO_FINAL" = "error" ] && [[ "$MENSAJE_FINAL" == *"dañado"* ]]; verificar "un archivo corrupto termina en error con un mensaje legible" $?
[ "$(existe "$BASE_PRUEBA/103/original.mp4")" = "200" ]; verificar "con error el original se conserva para reintentar" $?
generar_video largo -f lavfi -i color=c=black:s=64x64:r=1 -t 1860 -c:v libx264 -pix_fmt yuv420p
subir_original 104 "$DIRECTORIO_TEMPORAL/largo.mp4"
lanzar 104 00112233445566778899aabbccddeeff > /dev/null; esperar 104
[ "$ESTADO_FINAL" = "error" ] && [[ "$MENSAJE_FINAL" == *"más de 30 minutos"* ]]; verificar "un video de 31 minutos se rechaza (dura más de 30 minutos)" $?
[ "$(existe "$BASE_PRUEBA/104/hls/lista.m3u8")" != "200" ]; verificar "un video rechazado no deja lista HLS" $?
lanzar 105 00112233445566778899aabbccddeeff > /dev/null; esperar 105
[ "$ESTADO_FINAL" = "error" ]; verificar "un original que no existe en Storage termina en error" $?

echo
echo "$((total - fallos)) de $total casos correctos"
[ "$fallos" -eq 0 ]
