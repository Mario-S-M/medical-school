# SPEC 08 — Subida de videos de clase, con aviso de duración y procesado a HLS cifrado

**Estado:** Aprobado
**Depende de:** SPEC 07 (y, a través de ella, SPEC 06, 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-09
**Objetivo:** Permitir que el instructor y su equipo de apoyo suban el video de cada clase con una recomendación de 2 a 9 minutos y un aviso de clase larga, y que un servicio de transcodificación propio lo convierta a HLS de una sola calidad cifrado con AES-128 y lo guarde, ordenado por curso, sección y clase, en un bucket privado de Supabase Storage.

## Por qué existe esta spec

El usuario pidió una escuela en línea donde los videos no se puedan descargar "por nada del mundo", con clases muestra, una recomendación de duración y un aviso al subir clases grandes. Eso son dos mitades que se prueban por separado, así que se dividió en dos specs:

| Spec | Contenido |
|---|---|
| 08 (esta) | Subida, aviso de duración, transcodificación a HLS cifrado AES-128 y guardado ordenado. El video queda **listo y cifrado**, pero todavía nadie lo reproduce. |
| 09 | Reproducción protegida (clave de cifrado por sesión, listas con URLs firmadas de vida corta, reproductor con `hls.js`), marca de agua flotante con el correo del alumno y clases muestra reproducibles |
| 10 | Inscripción gratuita y porcentaje de avance |
| 11 | Preguntas de los alumnos moderadas por el equipo de apoyo |
| 12 | Rutas de aprendizaje |
| 13 | Estrellas, testimonios, preguntas frecuentes y "Mejorar con IA" de los conocimientos previos |

La hoja de ruta de la SPEC 07 numeraba la inscripción como 09; con esta división todo lo posterior se recorre un número.

Por qué las dos mitades no van juntas: esta spec añade un servicio nuevo (el transcodificador), una tabla, seis workflows y la pantalla de subida; la otra, el reproductor y las reglas de acceso. El video cifrado se verifica sin reproductor (se descifra a mano con la clave), y la 09 parte de un video que ya existe.

## Alcance

**Entra:**

- **Servicio `transcodificador`** en `docker-compose.yml`, construido desde `transcodificador/` (Python estándar y `ffmpeg`), con su API **solo en la red interna** (puerto `8090`, sin publicar):
  - `POST /trabajos` `{ video_id, ruta_original, ruta_base, clave_hex }` → `202`; encola un trabajo y procesa **uno a la vez**.
  - `GET /trabajos/<video_id>` → estado del trabajo.
  - `GET /salud`.
  - Las peticiones exigen la cabecera `X-Secreto-Transcodificador`.
- **Qué hace un trabajo:** descarga el original de Storage, mide con `ffprobe`, rechaza lo que dure más de **30 minutos**, genera **una sola versión** (H.264 + AAC, alto máximo 720 sin ampliar, segmentos de 6 s) cifrada con **AES-128** con la clave que le da n8n, sube la lista y los segmentos a Storage, **borra el original** si todo salió bien y avisa a n8n por un webhook interno. Si falla, conserva el original y avisa del error.
- **Bucket privado `videos`** en Supabase Storage (`escuela/scripts/crear_bucket_videos.sh`), con rutas ordenadas:

  ```text
  cursos/<curso_id>/secciones/<seccion_id>/clases/<clase_id>/<video_id>/original.<ext>   # solo mientras se procesa
  cursos/<curso_id>/secciones/<seccion_id>/clases/<clase_id>/<video_id>/hls/lista.m3u8
  cursos/<curso_id>/secciones/<seccion_id>/clases/<clase_id>/<video_id>/hls/segmento_00001.ts …
  ```

  Todo vive en el volumen nombrado `storage-data` (SPEC 07); el transcodificador usa su propio volumen `transcodificador-trabajo` solo para archivos temporales.
- **Límite de Storage** (`FILE_SIZE_LIMIT` en `supabase/docker-compose.yml`) de 50 MB a **1 GiB**. El bucket `portadas` conserva su propio tope de 2 MB.
- **Datos:** tablas `escuela.videos_clase` y `escuela.claves_video` (`escuela/sql/003_videos.sql`). La clave AES-128 de cada video la genera el workflow de solicitud con `gen_random_bytes` de `pgcrypto` (el Code node de n8n no tiene `crypto`), vive en `claves_video` y **ningún endpoint de esta spec la devuelve**.
- **Seis workflows** en la carpeta `Escuela` de n8n, con grupos de nodos, notas y los subworkflows de la SPEC 07 (`Exigir rol`, `Validar campos`, `Validar acceso a curso`):
  - `POST /escuela/solicitar-subida-video` `{ clase_id, nombre_archivo, tipo_contenido, tamano_bytes }` → `201 { video_id, url_subida, ruta }`. Acepta `video/mp4`, `video/quicktime` y `video/webm`, de 1 byte a 1 073 741 824; si no, `422 VIDEO_INVALIDO`. Crea el registro en `esperando_archivo` y firma la subida directa a Storage (como las portadas: el archivo nunca pasa por n8n).
  - `POST /escuela/confirmar-subida-video` `{ video_id }` → `202 { estado: 'en_cola' }`. Comprueba en Storage que el archivo exista y cumpla los límites (`422 VIDEO_INVALIDO` si no) y le pide el trabajo al transcodificador.
  - `GET /escuela/estado-video?clase_id=` → `{ vigente, nuevo }`: el video que se sirve y, si lo hay, el que se está subiendo o procesando (con su `error`). Un video `en_cola` o `procesando` sin cambios en 45 minutos pasa a `error` con el mensaje "El procesamiento tardó demasiado."
  - `POST /escuela/reintentar-video` `{ video_id }` → `202`. Solo para un video en `error` cuyo original se conservó.
  - `POST /escuela/borrar-video` `{ clase_id }` → `204`. Borra el video vigente y cualquiera en proceso o con error de esa clase, con sus archivos.
  - **Webhook interno** `POST /webhook/escuela/interno/video-procesado` `{ video_id, resultado, duracion_segundos?, mensaje? }`, que llama el transcodificador. Marca el video `listo` (y lo hace el vigente de su clase, borrando el anterior) o `error`. **No está en Caddy**: no se alcanza desde fuera.
- **Permisos:** subir, reemplazar, reintentar y borrar videos lo hacen el **instructor dueño y su equipo de apoyo** (como el temario) y **no** se puede en un curso `en_revision` (`409 CURSO_EN_REVISION`). En un curso `publicado` sí, sin nueva revisión.
- **Reemplazo:** subir otro video a una clase que ya tiene uno crea un video nuevo; el anterior **sigue siendo el vigente** hasta que el nuevo queda `listo`. Solo puede haber un video en proceso por clase (`409 VIDEO_EN_PROCESO`).
- **Limpieza:** `borrar-clase` y `borrar-seccion` borran también los archivos de sus videos en Storage.
- **Cambios a lo existente:**
  - `curso-edicion` devuelve en cada clase `video: { estado, duracion_segundos } | null` (el vigente) y `video_nuevo: { id, estado, error } | null` (el `id` lo necesita el botón de reintentar).
  - `enviar-revision` suma la falta `falta_video`: **cada clase necesita su video `listo`**.
  - Las pruebas de la SPEC 07 que enviaban cursos a revisión sin video se ajustan.
  - Caddy permite las cinco rutas públicas nuevas.
- **Credencial `Secreto transcodificador`** (Header Auth, cabecera `X-Secreto-Transcodificador`) con `escuela/scripts/crear_credencial_transcodificador.sh`; la usan n8n para llamar al transcodificador y el webhook interno para autenticarlo. Valor en el `.env` como `SECRETO_TRANSCODIFICADOR` (`openssl rand -hex 32`), y su línea sin valor en `.env.example`.
- **Front** (`frontend/src/`, cada archivo ≤ 50 líneas): en el editor del curso, cada clase muestra su estado de video y permite **subir, reemplazar, reintentar y borrar**:
  - **recomendación fija** junto al selector de archivo: "Recomendamos clases de entre 2 y 9 minutos";
  - **aviso de clase larga**: si el archivo dura **más de 9 y hasta 30 minutos**, aparece "¿Estás seguro de que quieres subir una clase tan grande?" con un texto que pide, de preferencia, clases más cortas y las opciones **Subir de todos modos** y **Elegir otro archivo**;
  - **bloqueo** si dura más de 30 minutos o pesa más de 1 GiB;
  - **barra de progreso** de la subida y estado consultado cada 3 segundos mientras el video está `en_cola` o `procesando`.
- Pruebas: casos nuevos en `escuela/pruebas/pruebas.sh`, prueba del transcodificador y e2e con Playwright; `transcodificador/README.md` y `escuela/README.md` actualizados.

**No entra:**

- Reproducir el video, entregar la clave de cifrado, listas con URLs firmadas, `hls.js`, marca de agua y reproducir las clases muestra (SPEC 09). Aquí el video queda guardado y cifrado y **nadie puede verlo todavía**.
- Quién ve qué clases según su inscripción (SPEC 09 y 10). Esta spec solo decide quién las sube.
- Varias calidades (360/720/1080), miniaturas, subtítulos y capítulos.
- DRM comercial (Widevine, FairPlay).
- Subida reanudable (TUS) y compresión en el navegador: la subida es un solo `PUT`.
- Cola persistente, varios trabajos en paralelo y reconciliación automática tras reiniciar el transcodificador (se reintenta a mano).
- Aviso por correo cuando el video queda listo.
- Antivirus o revisión de contenido del archivo y cuotas de disco por instructor.
- Borrar cursos y limpieza periódica de subidas abandonadas.
- Exponer el transcodificador fuera de la red de Docker.

## Modelo de datos

**Base `n8n`, esquema `escuela`** (`escuela/sql/003_videos.sql`, se aplica con el rol de n8n; idempotente):

```sql
CREATE TABLE IF NOT EXISTS escuela.videos_clase (
  id               bigserial   PRIMARY KEY,
  clase_id         bigint      NOT NULL REFERENCES escuela.clases ON DELETE CASCADE,
  estado           text        NOT NULL CHECK (estado IN ('esperando_archivo', 'en_cola', 'procesando', 'listo', 'error')),
  vigente          boolean     NOT NULL DEFAULT false,   -- el video que se sirve
  nombre_original  text        NOT NULL,
  tipo_contenido   text        NOT NULL CHECK (tipo_contenido IN ('video/mp4', 'video/quicktime', 'video/webm')),
  tamano_bytes     bigint      NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 1073741824),
  duracion_segundos integer,
  ruta_base        text        NOT NULL,                 -- cursos/<c>/secciones/<s>/clases/<k>/<id>
  error            text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  listo_en         timestamptz
);
-- un solo video vigente por clase y uno solo en proceso
CREATE UNIQUE INDEX IF NOT EXISTS videos_vigente_unico ON escuela.videos_clase (clase_id) WHERE vigente;
CREATE UNIQUE INDEX IF NOT EXISTS videos_en_proceso_unico ON escuela.videos_clase (clase_id)
  WHERE estado IN ('esperando_archivo', 'en_cola', 'procesando');

CREATE TABLE IF NOT EXISTS escuela.claves_video (
  video_id bigint PRIMARY KEY REFERENCES escuela.videos_clase ON DELETE CASCADE,
  clave    bytea  NOT NULL CHECK (octet_length(clave) = 16)   -- AES-128
);
```

**Reglas:**

- `ruta_base` se calcula al solicitar la subida con los ids reales y no cambia. El original vive en `<ruta_base>/original.<ext>` (`mp4`, `mov` o `webm`) y la salida en `<ruta_base>/hls/`.
- **Estados:** `esperando_archivo` → `en_cola` (al confirmar) → `procesando` (cuando el transcodificador empieza) → `listo` o `error`. Un video `error` con original conservado se puede reintentar (vuelve a `en_cola`).
- **Al quedar `listo`**, en una sola sentencia: el anterior vigente de esa clase deja de serlo y se borra su fila (los archivos, en un paso aparte, con el mismo borrado), y el nuevo pasa a `vigente = true`.
- **Tiempo máximo:** un video `en_cola` o `procesando` con `actualizado_en` de más de 45 minutos se trata como `error` ("El procesamiento tardó demasiado.") la próxima vez que se consulta su estado.
- `claves_video.clave` son 16 bytes aleatorios generados con `gen_random_bytes(16)` (extensión `pgcrypto`, en `escuela/sql/000_extensiones.sql`) al registrar el video; no se incluye en ninguna respuesta de la API ni en ninguna columna de `videos_clase`.

**Contrato del transcodificador** (red interna `http://transcodificador:8090`, cabecera `X-Secreto-Transcodificador`; sin ella `403`):

| Método y ruta | Entrada | Salida |
|---|---|---|
| `POST /trabajos` | `{ video_id, ruta_original, ruta_base, clave_hex }` (`clave_hex`: 32 caracteres hexadecimales) | `202 { estado: 'en_cola' }`; `409` si ese `video_id` ya está en la cola o procesándose; `422` si falta un campo |
| `GET /trabajos/<video_id>` | | `{ estado: 'en_cola' \| 'procesando' \| 'listo' \| 'error', mensaje? }` o `404` |
| `GET /salud` | | `200 { listo: true }` |

**Salida de un trabajo en Storage** (bucket `videos`): `<ruta_base>/hls/lista.m3u8` con `#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x…` (el `URI` es un marcador que la SPEC 09 sustituirá por la URL del endpoint de claves) y los segmentos `segmento_NNNNN.ts` de 6 s cifrados. Al terminar llama a `POST http://n8n:5678/webhook/escuela/interno/video-procesado` con la misma cabecera secreta (hasta 5 intentos, con espera creciente).

**Endpoints nuevos** (mismo formato de error que SPEC 04 y 07; los `POST` no aceptan campos extra):

| Método y ruta | Quién | Entrada → salida |
|---|---|---|
| `POST /escuela/solicitar-subida-video` | dueño, equipo | `{ clase_id, nombre_archivo, tipo_contenido, tamano_bytes }` → `201 { video_id, url_subida, ruta }` |
| `POST /escuela/confirmar-subida-video` | dueño, equipo | `{ video_id }` → `202 { estado }` |
| `GET /escuela/estado-video?clase_id=` | dueño, equipo | → `{ vigente: { id, estado, duracion_segundos, listo_en } \| null, nuevo: { id, estado, error } \| null }` |
| `POST /escuela/reintentar-video` | dueño, equipo | `{ video_id }` → `202 { estado: 'en_cola' }` |
| `POST /escuela/borrar-video` | dueño, equipo | `{ clase_id }` → `204` |

**Errores nuevos:**

| Código | HTTP | Cuándo |
|---|---|---|
| `VIDEO_INVALIDO` | 422 | tipo distinto de MP4, MOV o WebM, más de 1 073 741 824 bytes, archivo no subido al confirmar o que no coincide con lo declarado |
| `VIDEO_EN_PROCESO` | 409 | la clase ya tiene un video subiéndose o procesándose |
| `SERVICIO_NO_DISPONIBLE` | 503 | n8n no pudo hablar con el transcodificador al confirmar o reintentar (el video queda en `error` y se puede reintentar) |

`NO_ENCONTRADO`, `SIN_PERMISO` y `CURSO_EN_REVISION` se reutilizan de la SPEC 07, igual que `CURSO_INCOMPLETO` (con la regla nueva `falta_video` en `detalles`).

**Cambio en `curso-edicion`** (dentro de cada clase):

```json
{ "id": 7, "titulo": "Bienvenida", "es_muestra": true, "duracion_estimada_minutos": 4,
  "video": { "estado": "listo", "duracion_segundos": 252 },
  "video_nuevo": { "id": 31, "estado": "procesando", "error": null } }
```

**Variables del `.env`:** `SECRETO_TRANSCODIFICADOR` (nueva). El servicio `transcodificador` también lee `SERVICE_ROLE_KEY`, que ya existe, para hablar con Storage.

**Servicio en el compose:** `transcodificador` con `build: ./transcodificador`, `restart: unless-stopped`, volumen `transcodificador-trabajo` en `/trabajo`, `mem_limit` de 2 GB, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, usuario sin privilegios y **sin `ports`**.

**Front** (nuevos o modificados, cada archivo ≤ 50 líneas):

- `api/videos.ts` y `api/tipos_videos.ts`; `Clase` en `api/tipos_escuela.ts` gana `video` y `video_nuevo`.
- `validacion/video.ts`: constantes `RECOMENDADO_MIN = 2`, `AVISO_DESDE_MIN = 9`, `MAXIMO_MIN = 30`, `MAXIMO_BYTES` y la función que clasifica un archivo (`normal`, `corta`, `larga` o `rechazada`).
- `hooks/useSubirVideo.ts` (pide la firma, sube con progreso y confirma), `hooks/useEstadoVideo.ts` (consulta cada 3 s mientras hay un video en cola o procesando) y `hooks/useDuracionVideo.ts` (lee la duración con un elemento `<video>` en memoria).
- `componentes/instructor/`: `SubirVideo`, `EstadoVideo`, `AvisoClaseLarga`, `BarraProgreso` y `BotonesVideo`; `FilaClase` los integra.

## Plan de implementación

1. **Almacenamiento y secreto.** Subir `FILE_SIZE_LIMIT` de Storage a 1 GiB (recrear `storage`), crear `escuela/scripts/crear_bucket_videos.sh` (bucket privado `videos`, tope de 1 GiB) y añadir `SECRETO_TRANSCODIFICADOR` al `.env` y a `.env.example`. Comprobar: subir con URL firmada un archivo de 60 MB al bucket funciona (con 50 MB ya no), y un `GET` anónimo al objeto no devuelve `200`.
2. **Transcodificador.** Crear `transcodificador/` (`Dockerfile`, `servidor.py`, `README.md`) y el servicio en el compose, sin puertos. Comprobar con un video de prueba subido a mano al bucket: `POST /trabajos` desde el contenedor de n8n, esperar `listo`, ver los archivos en la ruta ordenada, confirmar que el original se borró, que `lista.m3u8` trae `METHOD=AES-128`, que un segmento no es un TS válido (`ffprobe` falla) y que descifrado con la clave sí lo es. Probar también un archivo corrupto (estado `error`, original conservado) y un video de más de 30 minutos (rechazado).
3. **Datos y credencial.** Crear y aplicar `escuela/sql/003_videos.sql`, el script de la credencial `Secreto transcodificador` y ejecutarlo. Comprobar: el SQL se aplica dos veces sin errores, los dos índices únicos impiden un segundo vigente y un segundo video en proceso, y la clave de 17 bytes se rechaza.
4. **Solicitar y confirmar la subida.** Workflows `Solicitar subida de video` y `Confirmar subida de video` y sus rutas en Caddy. Comprobar con `curl`: permisos, límites y tipos, `VIDEO_EN_PROCESO`, subir con la URL firmada, confirmar y ver el video `en_cola` (o `procesando`).
5. **Resultado del procesado.** Workflows `Video procesado` (webhook interno) y `Estado del video` con el tiempo máximo de 45 minutos. Comprobar de punta a punta: subir un video de unos segundos y ver `listo` con su duración; reemplazarlo y ver que el anterior sigue vigente hasta que el nuevo termina y luego se borra con sus archivos; un archivo corrupto termina en `error`.
6. **Reintentar, borrar y limpiar.** Workflows `Reintentar video` y `Borrar video`; `borrar-clase` y `borrar-seccion` borran los archivos; `curso-edicion` devuelve `video` y `video_nuevo`; `enviar-revision` suma `falta_video`. Ajustar las pruebas de la SPEC 07 que enviaban cursos a revisión (ahora insertan un video `listo` de prueba por SQL) y comprobar que siguen en verde.
7. **Front.** Estado de video en cada clase, `SubirVideo` con la recomendación, el aviso de clase larga, el bloqueo, la barra de progreso y el sondeo; reemplazar, reintentar y borrar. Comprobar a mano con videos de 1, 5, 10 y 31 minutos.
8. **Contrato, pruebas y documentación.** Casos en `escuela/pruebas/pruebas.sh`, pruebas e2e en Playwright (los videos de prueba se generan con el `ffmpeg` del transcodificador), colección de Postman y READMEs (`transcodificador/README.md`, `escuela/README.md`, `frontend/README.md`). Ejecutar todas las suites y repasar los criterios.

## Criterios de aceptación

- [ ] `escuela/pruebas/pruebas.sh` y `auth/pruebas/pruebas.sh` terminan con código 0 contra el stack levantado, incluidos los casos de SPEC 07 ya ajustados.
- [ ] `npx playwright test` termina con código 0, `npm run build` y `npx astro check` pasan, `frontend/scripts/verificar_tamano.sh` pasa y `docker compose config -q` pasa.
- [ ] `transcodificador` está en ejecución, **no publica ningún puerto** en el host y responde `200` en `/salud` desde el contenedor de `n8n` (`http://transcodificador:8090/salud`); sin la cabecera `X-Secreto-Transcodificador`, `POST /trabajos` responde `403`.
- [ ] El `ffmpeg` del contenedor incluye `libx264` y `aac`, y el servicio corre con un usuario sin privilegios, con el sistema de archivos en solo lectura y con un límite de memoria de 2 GB.
- [ ] `FILE_SIZE_LIMIT` de Storage vale `1073741824` y el bucket `videos` es privado: un `GET` anónimo a un objeto suyo no devuelve `200`.
- [ ] `escuela/sql/003_videos.sql` se aplica dos veces seguidas sin errores; un segundo video `vigente` en la misma clase y un segundo video en proceso en la misma clase son rechazados por la base; una clave de 17 bytes también.
- [ ] `solicitar-subida-video` por un usuario sin rol de instructor ni equipo da `403`, en una clase de un curso ajeno da `403`, en una inexistente `404`, y en un curso `en_revision` `409 CURSO_EN_REVISION`. El instructor dueño y un miembro del equipo reciben `201`.
- [ ] `solicitar-subida-video` con `video/avi`, con `tamano_bytes` 0 o 1 073 741 825, con un campo extra o sin `nombre_archivo` da `422`; con exactamente 1 073 741 824 y `video/mp4` da `201`. Una segunda solicitud con la primera sin terminar da `409 VIDEO_EN_PROCESO`.
- [ ] `confirmar-subida-video` sin haber subido el archivo da `422 VIDEO_INVALIDO`; tras subir un MP4 de unos segundos con la URL firmada devuelve `202` y, en menos de 2 minutos, `estado-video` lo muestra `listo` con `duracion_segundos` igual a la real (±1 s).
- [ ] Un video `listo` deja en el bucket `videos` `…/<video_id>/hls/lista.m3u8` y sus segmentos de 6 s bajo la ruta `cursos/<curso_id>/secciones/<seccion_id>/clases/<clase_id>/<video_id>/`, y **no** deja `original.*`.
- [ ] La lista `lista.m3u8` contiene `#EXT-X-KEY:METHOD=AES-128`; un segmento descargado no es un TS válido (`ffprobe` falla) y, descifrado con la clave de `claves_video` y el `IV` de la lista, sí lo es.
- [ ] El alto máximo es 720: un original de 1080p sale de 720 y uno de 360p sale de 360, sin ampliarse.
- [ ] Ninguna respuesta de la API (incluidos `curso-edicion`, `estado-video` y los errores) contiene la clave de cifrado ni los 32 caracteres hexadecimales de `clave_hex`.
- [ ] Un archivo corrupto con extensión `.mp4` termina en `error` con un mensaje legible y conserva el original; `reintentar-video` lo devuelve a `en_cola` (y vuelve a `error` si sigue corrupto). Un video de 31 minutos termina en `error` con "dura más de 30 minutos".
- [ ] Reemplazar el video de una clase deja el anterior como vigente mientras el nuevo está `en_cola` o `procesando`; cuando el nuevo queda `listo`, es el único vigente y los archivos del anterior ya no existen en Storage.
- [ ] `borrar-video` responde `204`, borra la fila y los archivos del video vigente y del que estuviera en proceso o con error, y `curso-edicion` muestra `video: null`. `borrar-clase` y `borrar-seccion` también dejan sin archivos a sus videos.
- [ ] Un video `en_cola` con `actualizado_en` retrasado 46 minutos aparece como `error` con "El procesamiento tardó demasiado." en `estado-video`.
- [ ] `curso-edicion` devuelve en cada clase `video` (con `estado` y `duracion_segundos`) y `video_nuevo`; `enviar-revision` de un curso con una clase sin video `listo` da `422 CURSO_INCOMPLETO` con `falta_video` en `detalles`, y con todos los videos `listo` envía el curso.
- [ ] El webhook interno `video-procesado` no se alcanza por Caddy (`POST /escuela/interno/video-procesado` y `/webhook/escuela/interno/video-procesado` dan `404`) y por el puerto 5678 directo responde `403` sin el secreto y con un secreto equivocado.
- [ ] Un curso en revisión rechaza `solicitar-subida-video`, `confirmar-subida-video`, `reintentar-video` y `borrar-video` con `409 CURSO_EN_REVISION`; en un curso publicado se aceptan sin cambiar su estado.
- [ ] En el editor, junto a cada clase se lee "Recomendamos clases de entre 2 y 9 minutos". Un video de 5 minutos se sube sin avisos; uno de 10 minutos muestra "¿Estás seguro de que quieres subir una clase tan grande?" con **Subir de todos modos** (que sigue la subida) y **Elegir otro archivo** (que la cancela); uno de 31 minutos y uno de más de 1 GiB se rechazan sin subirse.
- [ ] Durante el procesado la clase muestra su estado y se actualiza sola hasta "Listo" con la duración; en `error` muestra el mensaje y el botón **Reintentar**; reemplazar y borrar piden confirmación.
- [ ] Ningún workflow nuevo guarda ejecuciones correctas, todos están publicados en la carpeta `Escuela`, cada uno tiene su nota general y sus grupos de nodos (`python3 escuela/scripts/revisar_notas.py` termina con código 0), y la comprobación de permisos reutiliza `Exigir rol`, `Validar campos` y `Validar acceso a curso` sin copiarlas.
- [ ] Ningún archivo de `transcodificador/`, `escuela/` ni `frontend/` contiene `SERVICE_ROLE_KEY`, `SECRETO_TRANSCODIFICADOR`, `SECRETO_PROXY` ni `JWT_SECRET`, y `.env.example` incluye `SECRETO_TRANSCODIFICADOR` sin valor.
- [ ] `transcodificador/README.md` documenta su API, cómo construirlo y probarlo; `escuela/README.md` documenta los endpoints, los errores nuevos, el esquema de rutas del bucket y la credencial nueva; la colección de Postman tiene las cinco peticiones nuevas y sigue siendo JSON válido sin secretos.

## Decisiones tomadas y descartadas

**Alcance y división:**

- **Tomada: dividir en dos specs, la subida y procesado (esta) y la reproducción protegida con marca de agua (SPEC 09).** El video cifrado se verifica sin reproductor, y la 09 parte de algo que ya existe. **Descartada:** una sola spec con más de diez pasos y decisiones en cuatro dominios.
- **Tomada: el video queda listo pero nadie lo ve todavía.** Es un estado intermedio deliberado: cierra el cifrado antes de abrir el acceso. **Descartado:** un reproductor provisional sin protección, que sería justo lo que el usuario no quiere.

**Procesamiento:**

- **Tomada: servicio propio `transcodificador` en Docker (Python y `ffmpeg`), con trabajos de uno en uno.** n8n no trae `ffmpeg`, y con 8 GB de RAM en Docker un solo trabajo a la vez evita agotarla. **Descartados:** `ffmpeg` dentro de n8n con *Execute Command* (desactivado por seguridad en n8n 2.x y mezcla un proceso pesado con el motor de workflows) y un servicio externo (Mux, Bunny), que cuesta dinero y saca los videos de la infraestructura.
- **Tomada: una sola versión de hasta 720p, H.264 y AAC, segmentos de 6 s.** Alcanza para clases de 2 a 9 minutos, procesa rápido y pesa poco. **Descartada:** escalera 360/720/1080, que triplica el tiempo y el espacio y complica las claves.
- **Tomada: se borra el original al terminar bien** (y se conserva si falla, para reintentar). Ahorra disco y evita dejar un MP4 sin cifrar. **Descartado:** conservarlo en un bucket privado.
- **Tomada: el transcodificador avisa a n8n con un webhook interno con secreto** y el estado se guarda en la base; el front consulta cada 3 s. **Descartados:** que n8n pregunte al transcodificador por cada video y mantener conexiones abiertas.
- **Tomada: tiempo máximo de 45 minutos sin cambios, revisado al consultar el estado.** Cubre el caso de un transcodificador reiniciado, que pierde su cola en memoria, sin una tarea periódica aparte. **Descartada:** cola persistente (otra spec si hace falta).

**Datos y almacenamiento:**

- **Tomada: Supabase Storage (ya decidido en la SPEC 07), en un bucket privado `videos` con rutas curso/sección/clase/video.** Las URLs firmadas de la SPEC 09 salen de ahí. **Descartados:** un servidor de archivos propio y varios volúmenes Docker por rango de cursos, que Storage no soporta de forma nativa.
- **Tomada: "en volúmenes" significa carpetas ordenadas dentro del volumen nombrado `storage-data`**, más un volumen aparte (`transcodificador-trabajo`) para lo temporal. **Descartada:** repartir por varios volúmenes.
- **Tomada: la clave AES-128 en una tabla aparte (`claves_video`) y generada con `pgcrypto` desde el workflow** (el Code node de n8n no expone `crypto` y `require('crypto')` está prohibido; se comprobó al implementar). **Descartado:** `gen_random_uuid()`, que fija 6 de los 128 bits. Queda fuera de cualquier `SELECT` de la ficha o del editor y la SPEC 09 la entregará con permisos. **Descartada:** una columna en `videos_clase`, que se filtraría con cualquier consulta descuidada.
- **Tomada: un único video vigente por clase y uno solo en proceso, ambos garantizados con índices únicos parciales.** **Descartado:** controlarlo solo en los workflows.
- **Tomada: Storage sube su límite global a 1 GiB; los límites reales por bucket los pone cada bucket** (`portadas` sigue en 2 MB). **Descartado:** subir los videos por n8n, que ya choca con el límite de 10 KB de Caddy.

**Duración y avisos:**

- **Tomada: recomendar 2 a 9 minutos, avisar por encima de 9 y hasta 30, y rechazar por encima de 30 minutos o de 1 GiB.** El usuario pidió recomendar 2 a 8 o 9 minutos y permitir clases grandes con aviso; el tope duro protege el disco y el transcodificador. Se fijó 9 como umbral del aviso. **Descartados:** 60 minutos y 2 GB, y no poner tope.
- **Tomada: la duración se mide dos veces:** en el navegador para avisar antes de subir (si el navegador no puede leerla, se sube igual) y con `ffprobe` en el servidor, que es la que vale y la que rechaza lo que pasa de 30 minutos. **Descartado:** fiarse solo del navegador.
- **Tomada: menos de 2 minutos no muestra aviso, solo la recomendación fija.** **Descartado:** bloquear o avisar de las clases cortas.

**Permisos:**

- **Tomada: suben, reemplazan y borran el instructor dueño y su equipo de apoyo**, igual que el temario de la SPEC 07. **Descartado:** solo el dueño.
- **Tomada: en un curso publicado se puede reemplazar o borrar el video sin nueva revisión**, coherente con la SPEC 07. El video anterior sigue sirviendo hasta que el nuevo está listo. **Descartado:** exigir retirar el curso primero.
- **Tomada: `enviar-revision` exige un video `listo` en cada clase** (`falta_video`). Evita publicar clases vacías. **Descartada:** dejar el video opcional. Obliga a ajustar las pruebas de la SPEC 07.
- **Tomada: mientras no exista la inscripción, las clases que no son muestra solo las verá quien edita el curso o un administrador** (en la SPEC 09), y las muestras cualquier cuenta con sesión. **Descartado:** dar todas las clases a cualquier cuenta, que sería acceso gratis a todo.

**Seguridad:**

- **Tomada: el transcodificador solo vive en la red interna, con secreto compartido, usuario sin privilegios, sistema de archivos en solo lectura y límite de memoria.** Procesa archivos que sube un tercero. **Descartado:** publicarlo en el host.
- **Tomada: el webhook de resultado no está en Caddy.** Solo lo alcanza el transcodificador por la red de Docker. **Descartado:** reusar la ruta pública con el secreto del proxy.
- **Tomada: una credencial `Secreto transcodificador` para los dos sentidos** (n8n → transcodificador y transcodificador → n8n). **Descartado:** reutilizar `Secreto proxy`, que protege la puerta pública.
- **Valores fijados por defecto, sin preguntar al usuario, y abiertos a cambio:** el umbral del aviso en 9 minutos (él dijo "8 o 9") y el tiempo máximo de 45 minutos sin cambios antes de pasar a `error`. El resto de las decisiones de esta sección se aclaró con él.

## Riesgos identificados

- **`ffmpeg` de Alpine puede no traer `libx264` o el cifrado HLS** en `aarch64`: el paso 2 lo comprueba antes de seguir; si falta, se cambia la imagen base y se ajusta la spec.
- **8 GB de RAM en Docker para todo el stack:** un video de 30 minutos y 1 GiB procesado a la vez que Supabase y n8n puede acercarse al límite. Se mitiga con el límite de 2 GB, un solo trabajo a la vez y `-threads` acotado.
- **La cola vive en la memoria del transcodificador:** si se reinicia, los trabajos en curso se pierden. Los videos quedan `en_cola` o `procesando` hasta los 45 minutos y entonces se pueden reintentar (el original sigue en Storage).
- **Subida en un solo `PUT` de hasta 1 GiB:** una conexión inestable la corta y hay que empezar de nuevo (la subida reanudable queda fuera). El proxy `/almacen` de Astro y Kong deben aceptar cuerpos grandes: el paso 1 lo comprueba con un archivo de 60 MB y el paso 7 con uno mayor.
- **Subidas abandonadas:** si el navegador sube el archivo y nunca confirma, el video queda en `esperando_archivo` y su original en el bucket, sin limpieza automática.
- **La clave AES-128 está en la base en claro:** quien lea `claves_video` puede descifrar los videos. Solo la lee el rol de n8n. Cifrarla con una llave maestra es una mejora para una spec de seguridad.
- **Un archivo hostil** (códec raro, contenedor mal formado) llega a `ffmpeg`. Se mitiga con el usuario sin privilegios, el sistema de archivos de solo lectura, el límite de memoria y el tiempo máximo; no hay antivirus ni revisión de contenido.
- **El original sin cifrar existe en Storage mientras se procesa** (y si falla). Es un bucket privado: solo se alcanza con la clave de servicio o una URL firmada de corta vida.
- **El aviso de clase larga es de interfaz:** quien llame a la API directamente se salta el aviso. Es aceptable porque el servidor sigue rechazando lo que pasa de 30 minutos y de 1 GiB.
- **Cambiar `enviar-revision` rompe pruebas de la SPEC 07 ya cerradas:** el paso 6 las ajusta y deja constancia; los cursos ya publicados sin video no se tocan.
- **Dependencia de la hoja de ruta:** el `URI="clave"` de la lista es un marcador. La SPEC 09 debe reescribirlo en cada reproducción; hasta entonces, la lista almacenada no sirve para reproducir.

## Qué **no** hay en esta spec

- Reproductor, clave de cifrado entregable, URLs firmadas, marca de agua y clases muestra reproducibles (SPEC 09).
- Inscripción, avance y acceso de los alumnos (SPEC 10).
- Varias calidades, miniaturas, subtítulos, DRM y subida reanudable.
- Cola persistente, trabajos en paralelo, avisos por correo, antivirus y cuotas de disco.
- Borrar cursos y limpiar subidas abandonadas.

Cada uno de esos puntos, si llega, va en su propia spec.
