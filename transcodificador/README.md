# Transcodificador de videos de clase

Servicio de Docker (Python estándar y `ffmpeg`) que convierte el video original de una clase a **HLS de una sola calidad cifrado con AES-128** y lo guarda en el bucket privado `videos` de Supabase Storage. Definido en `specs/08-subida-videos-hls-cifrado.md`. Solo se alcanza por la red interna de Docker (`http://transcodificador:8090`): **no publica ningún puerto**.

```
API ──POST /trabajos──► transcodificador ──descarga el original / sube el HLS──► Supabase Storage (bucket videos)
API ◄──aviso interno video-procesado── transcodificador
```

## API

Las rutas `/trabajos` exigen la cabecera `X-Secreto-Transcodificador` (el valor de `SECRETO_TRANSCODIFICADOR` del `.env`); sin ella o con otro valor, `403`.

| Método y ruta | Entrada | Salida |
|---|---|---|
| `POST /trabajos` | `{ video_id, ruta_original, ruta_base, clave_hex }` | `202 { estado: 'en_cola' }`; `409` si ese `video_id` ya está en la cola o procesándose; `422` si falta un campo, sobra uno o algo no tiene el formato esperado |
| `GET /trabajos/<video_id>` | | `{ estado: 'en_cola' \| 'procesando' \| 'listo' \| 'error', mensaje? }` o `404` |
| `GET /salud` | | `200 { listo: true }` (sin secreto) |

- `ruta_base` debe ser `cursos/<curso>/secciones/<seccion>/clases/<clase>/<video>` y `ruta_original` `<ruta_base>/original.<mp4|mov|webm>`.
- `clave_hex` son 32 caracteres hexadecimales (la clave AES-128). **Nunca se guarda ni se sube**: vive solo durante el trabajo.

## Qué hace un trabajo

1. Descarga el original de Storage (con la clave de servicio) y lo mide con `ffprobe`. Si no es un video legible, `error`; si dura más de **30 minutos**, `error` con "El video dura más de 30 minutos."
2. Lo convierte con `ffmpeg`: H.264 (`main`) y AAC estéreo, **alto máximo 720** (un original menor no se amplía), un fotograma clave cada 2 s y **segmentos de 6 s** cifrados con AES-128 (`-hls_key_info_file`, IV aleatorio por video). La lista declara `#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x…`: el `URI` es un marcador que la reproducción protegida (SPEC 09) sustituirá.
3. Sube `lista.m3u8` y los `segmento_00001.ts`… a `<ruta_base>/hls/` y **borra el original**. Si algo falla, el original se conserva para reintentar.
4. Avisa a la API con `POST` a `URL_CALLBACK` (`http://api:3000/api/v1/interno/video-procesado`) (`{ video_id, resultado, duracion_segundos?, mensaje? }` y la misma cabecera secreta), hasta 5 intentos con espera creciente.

Procesa **un trabajo a la vez**; la cola vive en memoria, así que un reinicio la pierde (los videos se reintentan desde la escuela).

## Seguridad

Procesa archivos que sube un tercero, así que corre con un usuario sin privilegios (`10001`), sistema de archivos de solo lectura (solo `/trabajo`, un volumen nombrado, y `/tmp` escriben), `cap_drop: ALL`, `no-new-privileges` y un límite de memoria de 2 GB. No hay antivirus ni revisión de contenido.

## Construirlo y probarlo

```bash
docker compose up -d --build transcodificador
docker compose logs transcodificador
bash transcodificador/pruebas/pruebas.sh     # 31 casos; genera sus videos con el ffmpeg del contenedor y los borra al terminar
```

Variables (las pone `docker-compose.yml`): `SECRETO_TRANSCODIFICADOR`, `CLAVE_SERVICIO` (la `SERVICE_ROLE_KEY` de Supabase), `URL_STORAGE` y `URL_CALLBACK`.
