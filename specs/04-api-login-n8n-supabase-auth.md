# SPEC 04 — API de login con n8n como backend, Supabase Auth detrás y Caddy delante

**Estado:** Aprobado. 
**Depende de:** SPEC 03 (y, a través de ella, SPEC 01 y SPEC 02)
**Fecha:** 2026-11-09
**Objetivo:** Exponer en `auth/` una API de autenticación por correo y contraseña (registro, inicio de sesión, renovar, cierre de sesión y "quién soy") cuyo único backend son workflows de n8n que delegan en Supabase Auth, protegida por Caddy y por validaciones estrictas, bloqueos por cuenta e IP y errores uniformes, lista para que un framework de front la consuma.

## Alcance

**Entra:**
- Carpeta `auth/` con todo lo del login: `auth/workflows/`, `auth/sql/`, `auth/datos/`, `auth/proxy/`, `auth/pruebas/` y `auth/README.md` con el contrato de la API para el front. `auth/` es una excepción pedida por el usuario a la regla de nombres en español; todo lo demás va en español.
- Cinco endpoints bajo `/autenticacion/`, cada uno un workflow de n8n: registro, inicio de sesión, renovar, cierre de sesión y "quién soy".
- **Caddy como única entrada** (`127.0.0.1:8080`): solo reenvía `/autenticacion/*` a los webhooks de n8n; el resto responde 404, así el editor de n8n no queda expuesto. Además valida método (405), tipo de contenido (415), tamaño de cuerpo máximo de 10 KB (413), origen CORS configurable (`ORIGEN_FRONT`), cabeceras de seguridad, y añade la IP real del cliente y un secreto compartido con n8n.
- Los webhooks de n8n rechazan (403) cualquier petición que no traiga el secreto del proxy, aunque lleguen directo al puerto 5678.
- Validación estricta en n8n antes de tocar Supabase Auth: tipos, campos permitidos, formato y longitud de correo y nombre, y política de contraseña (ver Modelo de datos). Los errores devuelven un cuerpo uniforme en español con el detalle de cada regla que falló.
- Contraseña con política estricta: 12 a 72 bytes, mayúscula, minúscula, número y símbolo, sin espacios al inicio ni al final, sin contener el correo ni su parte local, y fuera de una lista de contraseñas comunes.
- Bloqueo por cuenta (5 fallos por correo en 15 min) y por IP (20 fallos en 15 min), con tabla de intentos en el esquema `autenticacion` de la base `n8n`.
- Token de acceso (JWT HS256 de Supabase, 15 min) en el cuerpo y token de renovación rotativo en cookie `HttpOnly` con `SameSite=Strict` (7 días). El cierre de sesión revoca la sesión en Supabase.
- Registro sin sesión y con respuesta idéntica si el correo ya existe (anti enumeración). Autoconfirmación de correo activada hasta la SPEC 05.
- Los workflows no guardan datos de ejecución, para que ninguna contraseña quede en la base de n8n. *Hallazgo al implementar:* con `none`, n8n solo marca la ejecución como borrada y su contenido (el cuerpo con la contraseña) sigue en `execution_data` hasta el borrado definitivo, que por defecto tarda más de 1 h. Se fijan `EXECUTIONS_DATA_HARD_DELETE_BUFFER=0` y `EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL=1` en el servicio `n8n` para que desaparezca en 1 o 2 minutos (comprobado: 0 filas a los 45 s). Estas variables afectan a todos los workflows de la instancia.
- Credencial n8n `Secreto proxy` (Header Auth) y carpeta `Autenticacion` en n8n con los cinco workflows.
- `auth/pruebas/pruebas.sh`: script con `curl` que recorre los criterios de aceptación y sale con error si alguno falla.
- *Añadido a petición del usuario:* colección de Postman v2.1 en `auth/postman/` (`autenticacion.postman_collection.json` y `local.postman_environment.json`) con los cinco endpoints. Las carpetas de la colección repiten la estructura del proyecto: colección `Medical School` → carpeta `Autenticacion` (la misma de n8n), con una petición por workflow y el mismo nombre que él (`Registro de usuario`, `Inicio de sesion`, `Renovar sesion`, `Quien soy`, `Cierre de sesion`). Cada petición lleva ejemplos de respuesta correcta y de error, y las de inicio de sesión y renovar guardan `token_acceso` en una variable de colección con un script de prueba. La importación en la app de Postman la hace el usuario (*Import*); el entorno no lleva secretos.

**No entra:**
- Recuperación de contraseña, SMTP y verificación de correo (SPEC 05).
- Login con Google, Apple y Facebook (SPEC 06). Supabase Auth ya guarda identidades externas en `auth.identities`, así que no se crea ninguna tabla propia para ellas.
- 2FA/MFA, roles y permisos, CAPTCHA, límite de registros por IP, cambio de contraseña o correo, borrado de cuenta, cierre de sesión en todos los dispositivos, desbloqueo manual de cuentas, auditoría y alertas.
- TLS, HSTS y el atributo `Secure` de la cookie: sin dominio HTTPS no se pueden probar (ver riesgos).
- Un front o un SDK de ejemplo: solo el contrato en `auth/README.md`.
- Quitar la publicación del puerto 5678 de n8n a `127.0.0.1` (lo protege el secreto del proxy).
- Cambiar la política de contraseña en Supabase Auth: su mínimo se queda en el valor por defecto y la política estricta vive en n8n.

## Modelo de datos

**Usuarios y sesiones:** viven en Supabase Auth (`auth.users`, `auth.sessions`, `auth.refresh_tokens`); no se crean tablas propias. El nombre se guarda en `user_metadata.nombre` y el correo se normaliza a minúsculas.

**Base `n8n`, esquema `autenticacion`** (`auth/sql/001_esquema_autenticacion.sql`, se aplica con el rol de n8n):

```sql
CREATE SCHEMA IF NOT EXISTS autenticacion;

CREATE TABLE IF NOT EXISTS autenticacion.intentos_inicio_sesion (
  id         bigserial   PRIMARY KEY,
  correo     text        NOT NULL,  -- minúsculas
  ip         inet        NOT NULL,
  exitoso    boolean     NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intentos_correo_creado_en_idx ON autenticacion.intentos_inicio_sesion (correo, creado_en DESC);
CREATE INDEX IF NOT EXISTS intentos_ip_creado_en_idx     ON autenticacion.intentos_inicio_sesion (ip, creado_en DESC);

CREATE TABLE IF NOT EXISTS autenticacion.contrasenas_comunes (
  contrasena text PRIMARY KEY       -- minúsculas
);
```

- `contrasenas_comunes` se llena con `auth/datos/contrasenas_comunes.txt` (las 10 000 contraseñas más comunes de SecLists, con el commit de origen anotado en el encabezado del archivo) usando `\copy`. La contraseña se compara en minúsculas y también sin dígitos ni símbolos finales.
- Regla de bloqueo: una cuenta está bloqueada mientras haya 5 o más intentos con `exitoso = false` de ese correo en los últimos 15 min (y posteriores al último `exitoso = true`). Una IP está frenada con 20 o más fallos en 15 min. Los intentos rechazados por bloqueo no se registran, y el bloqueo se cuenta por correo aunque la cuenta no exista, para que no revele cuáles existen. Cada inicio de sesión borra de paso las filas de más de 24 h.

**Endpoints** (todo bajo `http://127.0.0.1:8080`, todo JSON, identificadores en `snake_case`):

| Método y ruta | Entrada | Salida correcta |
|---|---|---|
| `POST /autenticacion/registro` | `{ correo, nombre, contrasena }` | `201 { mensaje }` (igual exista o no el correo; sin sesión) |
| `POST /autenticacion/iniciar-sesion` | `{ correo, contrasena }` | `200 { token_acceso, tipo_token: "Bearer", expira_en: 900, usuario: { id, correo, nombre } }` + `Set-Cookie: token_renovacion` |
| `POST /autenticacion/renovar` | cookie `token_renovacion` + cabecera `X-Solicitado-Con: front` | `200` igual que el inicio de sesión, con cookie rotada |
| `POST /autenticacion/cerrar-sesion` | `Authorization: Bearer <token_acceso>` | `204` + cookie borrada |
| `GET /autenticacion/yo` | `Authorization: Bearer <token_acceso>` | `200 { id, correo, nombre }` |

**Cookie:** `token_renovacion=<valor>; HttpOnly; SameSite=Strict; Path=/autenticacion; Max-Age=604800`. El token de renovación nunca aparece en el cuerpo.

**Formato de error** (todos los errores, también los de Caddy):

```json
{ "error": { "codigo": "CONTRASENA_INSEGURA", "mensaje": "La contraseña no cumple los requisitos.",
             "detalles": [ { "campo": "contrasena", "regla": "minimo_12_caracteres", "mensaje": "Debe tener al menos 12 caracteres." } ] } }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `JSON_INVALIDO` | 400 | cuerpo que no es JSON |
| `VALIDACION_FALLIDA` | 422 | campos faltantes, extra, de tipo o formato incorrecto |
| `CONTRASENA_INSEGURA` | 422 | incumple la política (lista todas las reglas fallidas) |
| `CREDENCIALES_INVALIDAS` | 401 | correo inexistente o contraseña incorrecta (mismo cuerpo exacto) |
| `CUENTA_BLOQUEADA` | 429 | 5 fallos por correo; incluye `reintentar_en_segundos` y `Retry-After` |
| `DEMASIADOS_INTENTOS` | 429 | 20 fallos por IP; incluye `Retry-After` |
| `TOKEN_INVALIDO` | 401 | token de acceso o de renovación ausente, inválido, expirado o revocado |
| `ORIGEN_NO_PERMITIDO` | 403 | `Origin` distinto de `ORIGEN_FRONT` o falta `X-Solicitado-Con` en `renovar` |
| `METODO_NO_PERMITIDO` | 405 | método que la ruta no admite |
| `TIPO_CONTENIDO_NO_SOPORTADO` | 415 | `Content-Type` distinto de `application/json` |
| `CUERPO_DEMASIADO_GRANDE` | 413 | cuerpo de más de 10 KB |
| `NO_ENCONTRADO` | 404 | cualquier ruta fuera de `/autenticacion/*` |
| `ERROR_INTERNO` | 500 | cualquier fallo inesperado, sin detalles internos |

**Reglas de campos:** `correo` es un correo válido de hasta 254 caracteres; `nombre` tiene entre 1 y 80 caracteres, sin caracteres de control; `contrasena` es texto de 12 a 72 bytes UTF-8 (límite de bcrypt en Supabase Auth). No se aceptan campos extra.

**Variables nuevas del `.env`:** `ORIGEN_FRONT` (por defecto `http://localhost:3000`, ajustable al framework que se elija) y `SECRETO_PROXY` (`openssl rand -hex 32`). Cambios de Supabase Auth en el `.env`: `JWT_EXPIRY=900`, `ENABLE_EMAIL_AUTOCONFIRM=true`, y en el servicio `auth` la variable `GOTRUE_SESSIONS_TIMEBOX=168h`.

## Plan de implementación

1. **Configurar Supabase Auth.** Ajustar `JWT_EXPIRY`, `ENABLE_EMAIL_AUTOCONFIRM` y `GOTRUE_SESSIONS_TIMEBOX`, recrear el servicio `auth` y comprobar que `/auth/v1/health` responde `200`. Probar a mano con `curl` directo a `auth:9999` que el registro, el inicio de sesión y la revocación funcionan con esos valores.
2. **Esquema y datos.** Crear `auth/sql/001_esquema_autenticacion.sql` y `auth/datos/contrasenas_comunes.txt`, y aplicarlos con el rol de n8n. Comprobar que el esquema, las dos tablas y las filas de la lista existen.
3. **Caddy.** Crear `auth/proxy/Caddyfile` y el servicio `caddy` en `docker-compose.yml` (imagen con tag exacto fijado en la implementación, puerto `127.0.0.1:8080`, depende de `n8n`). Añadir `ORIGEN_FRONT` y `SECRETO_PROXY` al `.env` y al `.env.example`. Crear el esqueleto de `auth/pruebas/pruebas.sh` con los casos de Caddy: 404, 405, 415, 413, cabeceras, CORS y que no se llega al editor de n8n.
4. **Credencial y carpeta en n8n.** Crear la credencial Header Auth `Secreto proxy` (por el CLI de n8n, sin dejar el secreto en archivos) y la carpeta `Autenticacion`. Dejar listo el patrón de los workflows: Webhook con esa credencial, `saveDataSuccessExecution` y `saveDataErrorExecution` en `none`, y la respuesta de error uniforme.
5. **Workflow `Registro de usuario`.** Validación de campos y de contraseña → llamada a `auth:9999/signup` → respuesta 201 idéntica exista o no el correo. Publicarlo, exportarlo a `auth/workflows/` y ampliar `pruebas.sh` con sus casos.
6. **Workflow `Inicio de sesion`.** Validación → comprobación de bloqueos por correo e IP → `auth:9999/token?grant_type=password` → registro del intento → respuesta con el token en el cuerpo y la cookie. Publicarlo, exportarlo y ampliar `pruebas.sh`.
7. **Workflow `Renovar sesion`.** Lee la cookie, llama a `auth:9999/token?grant_type=refresh_token` y devuelve el nuevo token con la cookie rotada. Publicarlo, exportarlo y ampliar `pruebas.sh`.
8. **Workflows `Quien soy` y `Cierre de sesion`.** `yo` valida el token con `auth:9999/user`; el cierre llama a `auth:9999/logout?scope=local` y borra la cookie. Publicarlos, exportarlos y ampliar `pruebas.sh`.
9. **Contrato y verificación final.** Escribir `auth/README.md` (endpoints, ejemplos de petición y respuesta, todos los códigos de error, cookie, CORS y cómo se conecta un framework). Generar la colección y el entorno de Postman en `auth/postman/`. Ejecutar `auth/pruebas/pruebas.sh` completo, comprobar que no quedaron ejecuciones guardadas ni secretos en los JSON y repasar los criterios.

## Criterios de aceptación

- [ ] `auth/pruebas/pruebas.sh` termina con código 0 contra el stack levantado y cubre cada criterio de esta lista que lo permite.
- [ ] `docker compose ps` muestra `caddy` en ejecución, publicado solo en `127.0.0.1:8080`, y `docker compose config -q` pasa.
- [ ] Por Caddy, `GET /`, `GET /signin` y `GET /webhook/autenticacion/yo` devuelven `404` con `NO_ENCONTRADO`: el editor de n8n y las rutas internas no se alcanzan.
- [ ] `GET /autenticacion/iniciar-sesion` devuelve `405`; un `POST` con `Content-Type: text/plain` devuelve `415`; un cuerpo de más de 10 KB devuelve `413`. Los tres usan el formato de error uniforme.
- [ ] Toda respuesta lleva `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y una `Content-Security-Policy` restrictiva, y ninguna incluye la cabecera `Server`.
- [ ] El preflight `OPTIONS` con `Origin: $ORIGEN_FRONT` devuelve `204` con `Access-Control-Allow-Origin` igual a ese origen y `Access-Control-Allow-Credentials: true`; con cualquier otro `Origin`, un `POST` devuelve `403` y no hay `Access-Control-Allow-Origin`.
- [ ] Llamar a `http://127.0.0.1:5678/webhook/autenticacion/yo` directo, sin el secreto del proxy o con uno incorrecto, devuelve `403`.
- [ ] Registro válido: `201` con `mensaje`; en `auth.users` existe un usuario con el correo en minúsculas y `raw_user_meta_data.nombre`; ninguna respuesta contiene la contraseña.
- [ ] Registrar dos veces el mismo correo devuelve el mismo cuerpo y estado `201` las dos veces, y en `auth.users` sigue habiendo una sola fila para ese correo.
- [ ] Una contraseña que incumple cada regla por separado (menos de 12, sin mayúscula, sin minúscula, sin número, sin símbolo, con espacio al inicio o al final, más de 72 bytes, que contiene el correo, que está en la lista de comunes) devuelve `422 CONTRASENA_INSEGURA` y `detalles` nombra la regla fallida; una contraseña que incumple varias lista todas.
- [ ] Un JSON roto devuelve `400 JSON_INVALIDO`. Un correo mal formado o de más de 254 caracteres, un nombre vacío, de más de 80 caracteres o con caracteres de control, un campo de tipo incorrecto, un campo faltante o un campo extra devuelven `422 VALIDACION_FALLIDA`.
- [ ] Inicio de sesión válido: `200` con `token_acceso`, `tipo_token`, `expira_en` = 900 y `usuario`; el JWT verifica con `JWT_SECRET`, tiene `role` = `authenticated` y `exp - iat` = 900.
- [ ] La respuesta del inicio de sesión trae `Set-Cookie` con `token_renovacion`, `HttpOnly`, `SameSite=Strict`, `Path=/autenticacion` y `Max-Age=604800`, y el cuerpo no contiene el token de renovación.
- [ ] Un correo inexistente y una contraseña incorrecta devuelven `401 CREDENCIALES_INVALIDAS` con cuerpos idénticos byte a byte.
- [ ] Tras 5 fallos del mismo correo, el sexto intento (aun con la contraseña correcta, y también con un correo inexistente) devuelve `429 CUENTA_BLOQUEADA` con `Retry-After` mayor que 0; al envejecer esos intentos más de 15 min en la tabla, vuelve a poder iniciar sesión.
- [ ] Con 20 fallos desde la misma IP con correos distintos, el intento 21 devuelve `429 DEMASIADOS_INTENTOS`.
- [ ] `renovar` con la cookie devuelve `200` con un token nuevo y una cookie distinta; sin cookie o con una cookie inválida devuelve `401 TOKEN_INVALIDO`; sin `X-Solicitado-Con` o con otro `Origin` devuelve `403 ORIGEN_NO_PERMITIDO`.
- [ ] Reusar una cookie de renovación ya rotada (pasado el intervalo de reutilización de Supabase Auth) devuelve `401 TOKEN_INVALIDO`.
- [ ] `yo` con un token válido devuelve `200 { id, correo, nombre }` sin campos internos; sin token, con un token manipulado o expirado devuelve `401 TOKEN_INVALIDO`.
- [ ] `cerrar-sesion` devuelve `204` y la cookie con `Max-Age=0`; después, esa cookie ya no renueva (`401`) y el token de acceso anterior ya no pasa `yo` (`401`).
- [ ] En la base `n8n`, 2 minutos después de ejecutar `pruebas.sh`, ni `execution_entity` ni `execution_data` tienen filas de los cinco workflows, y ninguna contraseña de las pruebas aparece en `execution_data`.
- [ ] Ningún JSON de `auth/workflows/`, el `.env.example` ni `auth/` contiene `SECRETO_PROXY`, `JWT_SECRET`, contraseñas ni el email del owner.
- [ ] En n8n existen la credencial `Secreto proxy` y la carpeta `Autenticacion` con los cinco workflows publicados, y todos los nombres de workflows, nodos, campos, tablas y variables nuevas están en español (excepto `auth/`).
- [ ] `auth/README.md` documenta los cinco endpoints con ejemplos de petición y respuesta, todos los códigos de error y la configuración de CORS para el front.
- [ ] `auth/postman/` contiene una colección y un entorno de Postman v2.1 que son JSON válido, la colección tiene la carpeta `Autenticacion` con las cinco peticiones nombradas como sus workflows, y ninguno de los dos archivos contiene contraseñas, `SECRETO_PROXY` ni `JWT_SECRET`.

## Decisiones tomadas y descartadas

- **Tomada: n8n es el único backend y Supabase Auth hace el trabajo criptográfico.** Hash de contraseñas, JWT, rotación de tokens y revocación los hace GoTrue, que está probado; n8n valida, limita intentos y da forma a las respuestas. **Descartada:** hashear con `pgcrypto` y firmar tokens en n8n.
- **Tomada: n8n llama a `auth:9999` por la red interna**, sin pasar por Kong. No necesita `apikey` y reduce un salto. **Descartada:** pasar por Kong con `ANON_KEY`. `SERVICE_ROLE_KEY` no se usa en este login.
- **Tomada: Caddy como única entrada, con secreto compartido.** Caddy borra cualquier `X-Forwarded-For` del cliente, fija la IP real en una cabecera propia y añade `SECRETO_PROXY`; los webhooks lo exigen con una credencial Header Auth. Así no se puede falsear la IP ni saltarse el proxy llamando al puerto 5678. **Descartadas:** Nginx, y confiar solo en que 5678 está en `127.0.0.1`.
- **Tomada: secreto del proxy como credencial Header Auth del Webhook, no con `$env`.** n8n bloquea por defecto el acceso a variables de entorno desde los nodos, y la credencial evita abrirlo.
- **Tomada: JWT de acceso de 15 min en el cuerpo y renovación rotativa en cookie `HttpOnly` + `SameSite=Strict`.** El JavaScript del front no puede leer el token de renovación y la cookie solo viaja al `Path` de la API. **Descartadas:** cookie de sesión con JWT aparte, JWT largo sin renovación, y devolver el token de renovación en el cuerpo.
- **Tomada: defensa contra CSRF en `renovar`** con `SameSite=Strict`, una cabecera personalizada (`X-Solicitado-Con`) que obliga al preflight de CORS, y comprobar `Origin` en Caddy.
- **Tomada: registro sin sesión y con respuesta idéntica.** No se revela qué correos existen; el usuario entra con el inicio de sesión. **Descartada:** `409` explícito, que permite enumerar correos.
- **Tomada: autoconfirmar el correo hasta la SPEC 05.** Sin SMTP no se puede verificar. **Descartada:** adelantar Mailpit y la confirmación obligatoria, que agrandan esta spec; queda el riesgo anotado.
- **Tomada: política de contraseña estricta en n8n.** Se aplica antes de llamar a Supabase y devuelve todas las reglas fallidas de una vez. **Descartadas:** política tipo NIST (menos fricción) y moderada.
- **Tomada: intentos en el esquema `autenticacion` de la base `n8n`**, con el rol y la credencial existentes. **Descartadas:** una base `postgres` de Supabase con rol nuevo, y depender solo de los límites internos de Supabase Auth, que no dan el mensaje de bloqueo ni el 429 por IP.
- **Tomada: bloqueo con ventana deslizante de 15 min, contado por correo aunque no exista.** Los intentos bloqueados no se registran, así que no se prolonga el bloqueo. **Descartada:** bloqueo progresivo (1, 2, 4… min).
- **Tomada: los workflows no guardan ejecuciones.** n8n guarda por defecto el cuerpo de las peticiones, que incluiría contraseñas en claro. **Descartada:** guardarlas para depurar.
- **Tomada: `pruebas.sh` con `curl` versionado.** Es repetible y no lleva secretos: los lee del `.env`. Las pruebas que necesitan aislar el estado limpian la tabla de intentos con `psql`. **Descartada:** verificación solo manual.
- **Tomada: dividir el login en las SPEC 03 a 06** (infraestructura, API, recuperación, social). Cada una se verifica sola.
- **Tomada: el atributo `Secure` y HSTS quedan fuera.** Se activan junto con TLS en otra spec.

## Riesgos identificados

- **Autoconfirmación de correo:** hasta la SPEC 05 cualquiera puede registrar un correo ajeno. No hay datos sensibles en la cuenta, pero no debe publicarse así.
- **La IP de los clientes en Docker Desktop:** en local, Caddy ve la IP de la pasarela de Docker para todos los clientes, así que el límite por IP actúa sobre todos juntos. Detrás de un proxy real de producción habrá que revisar qué IP llega.
- **Puerto 5678 sigue publicado en `127.0.0.1`:** lo protege el secreto del proxy, pero conviene retirarlo cuando el editor ya no haga falta desde el navegador.
- **Durante 1 o 2 minutos la contraseña de cada petición sigue en `execution_data`** (n8n marca la ejecución como borrada y la elimina en el siguiente ciclo de pruning). Es una ventana corta pero real: quien lea la base de n8n en ese lapso la vería. No hay forma de evitar que el cuerpo pase por el workflow.
- **Ejecuciones manuales desde el editor de n8n sí guardan datos**, aunque los workflows estén configurados para no guardarlos: no se deben probar los workflows de auth con contraseñas reales desde el botón *Execute*.
- **Los Code nodes necesitan el task runner de n8n:** si no funciona en esta versión, se reemplazan por nodos `IF`/`Set` y `Postgres`. Se comprueba en el paso 5.
- **Revocación del token de acceso:** el JWT es válido hasta que expira, salvo que Supabase Auth compruebe la sesión en `/user`. El criterio de `cerrar-sesion` lo verifica; si la versión no lo hace, `yo` pasará a consultar `auth.sessions`.
- **`GOTRUE_SESSIONS_TIMEBOX` puede no estar disponible** en `gotrue:v2.189.0`; si no lo está, la vida de la sesión quedará limitada solo por `Max-Age` de la cookie y se anota.
- **Fuga de existencia por tiempo de respuesta:** el inicio de sesión con un correo existente tarda más (bcrypt) que con uno inexistente. El bloqueo lo limita pero no lo elimina.
- **Carreras en los contadores:** peticiones simultáneas pueden superar el límite de 5 o 20 por unos pocos intentos.
- **Lista de contraseñas externa:** se descarga una vez de SecLists y se versiona con su commit de origen; si cambia la fuente, la lista versionada no cambia.
- **Bcrypt corta a 72 bytes:** por eso el límite se mide en bytes y no en caracteres; un front debe contarlos igual.
- **Cambiar `JWT_SECRET`, `ORIGEN_FRONT` o `SECRETO_PROXY`** exige recrear `auth` o `caddy`, y cambiar `SECRETO_PROXY` también la credencial `Secreto proxy` en n8n.
