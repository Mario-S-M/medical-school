# API de autenticación

Login por correo y contraseña, con verificación de correo y recuperación de contraseña por código. El **backend son workflows de n8n** que delegan en **Supabase Auth** (hash, JWT, sesiones y rotación de tokens); **Caddy** es la única entrada. Definida en `specs/04-api-login-n8n-supabase-auth.md` (login) y `specs/05-verificacion-correo-y-recuperar-contrasena.md` (códigos por correo).

```
front ──► Caddy 127.0.0.1:8080 ──► n8n (webhooks) ──► Supabase Auth (auth:9999) y Postgres (esquema autenticacion)
                                                       └─► SMTP (Mailpit en local) ──► correo del usuario
```

- Base URL local: `http://127.0.0.1:8080`
- Todo es JSON (`Content-Type: application/json`); los identificadores van en `snake_case` y en español.
- Fuera de `/autenticacion/*` Caddy responde `404`: el editor de n8n y Supabase no se alcanzan por este puerto.

## Endpoints

| Método y ruta | Entrada | Respuesta correcta |
|---|---|---|
| `POST /autenticacion/registro` | `{ correo, nombre, contrasena }` | `201 { mensaje }` (igual exista o no el correo; no abre sesión) |
| `POST /autenticacion/iniciar-sesion` | `{ correo, contrasena }` | `200 { token_acceso, tipo_token, expira_en, usuario }` + cookie `token_renovacion` |
| `POST /autenticacion/renovar` | cookie `token_renovacion` + cabecera `X-Solicitado-Con: front` | `200` igual que el inicio de sesión, con la cookie rotada |
| `POST /autenticacion/cerrar-sesion` | `Authorization: Bearer <token_acceso>` | `204` + cookie borrada |
| `GET /autenticacion/yo` | `Authorization: Bearer <token_acceso>` | `200 { id, correo, nombre }` |
| `POST /autenticacion/verificar-correo` | `{ correo, codigo }` | `200 { mensaje }` (solo confirma; no abre sesión) |
| `POST /autenticacion/reenviar-verificacion` | `{ correo }` | `202 { mensaje }` (igual exista, esté verificado o no) |
| `POST /autenticacion/recuperar` | `{ correo }` | `202 { mensaje }` (igual exista o no el correo) |
| `POST /autenticacion/restablecer` | `{ correo, codigo, contrasena_nueva }` | `200 { mensaje }` |

### Registro

```http
POST /autenticacion/registro
Content-Type: application/json

{ "correo": "ana@example.com", "nombre": "Ana", "contrasena": "Zorro#Azul-2026x" }
```

```json
201  { "mensaje": "Cuenta creada. Revisa tu correo y verifícala con el código que te enviamos." }
```

- `correo`: correo válido de hasta 254 caracteres (se guarda en minúsculas).
- `nombre`: 1 a 80 caracteres, sin caracteres de control.
- `contrasena`: ver la política más abajo.
- No se aceptan campos extra.
- Si el correo ya existe, la respuesta es **idéntica** (`201` con el mismo cuerpo) para no revelar qué correos están registrados. El registro **no inicia sesión**: llama después a `iniciar-sesion`.
- La cuenta queda **sin verificar**: llega un correo con un código de 6 dígitos que se canjea en `verificar-correo`. Hasta entonces `iniciar-sesion` responde `403 CORREO_NO_VERIFICADO` (solo si la contraseña es correcta).

**Política de contraseña** (se devuelven todas las reglas que falle, juntas):

| Regla | Significado |
|---|---|
| `minimo_12_caracteres` | al menos 12 caracteres |
| `maximo_72_bytes` | como máximo 72 bytes en UTF-8 (límite de bcrypt; ojo con tildes y emojis, que ocupan más de 1 byte) |
| `requiere_mayuscula` / `requiere_minuscula` / `requiere_numero` / `requiere_simbolo` | al menos una de cada |
| `sin_espacios_extremos` | no empieza ni termina con espacios |
| `no_contiene_correo` | no contiene el correo ni su parte local (de 4 o más caracteres) |
| `no_es_comun` | no está entre las 10 000 contraseñas más comunes (también se prueba sin números ni símbolos al final) |

### Inicio de sesión

```http
POST /autenticacion/iniciar-sesion
Content-Type: application/json

{ "correo": "ana@example.com", "contrasena": "Zorro#Azul-2026x" }
```

```http
200 OK
Set-Cookie: token_renovacion=zs37qxccacp2; HttpOnly; SameSite=Strict; Path=/autenticacion; Max-Age=604800

{ "token_acceso": "<JWT>", "tipo_token": "Bearer", "expira_en": 900,
  "usuario": { "id": "…", "correo": "ana@example.com", "nombre": "Ana" } }
```

- `token_acceso` es un JWT HS256 de **15 minutos** (`expira_en` en segundos). Va en `Authorization: Bearer …`.
- El token de renovación **nunca** viaja en el cuerpo: solo en la cookie `HttpOnly`, y el JavaScript del front no puede leerla.
- Un correo inexistente y una contraseña incorrecta devuelven exactamente el mismo `401`.
- Si la contraseña es correcta pero el correo no está verificado: `403 CORREO_NO_VERIFICADO`. No cuenta como intento fallido; ofrece "reenviar código" en el front.

**Bloqueos** (ventana de 15 minutos):

- 5 intentos fallidos del mismo correo bloquean ese correo (exista o no la cuenta): `429 CUENTA_BLOQUEADA`.
- 20 intentos fallidos desde la misma IP: `429 DEMASIADOS_INTENTOS`.
- Ambos incluyen `reintentar_en_segundos` y la cabecera `Retry-After`. Los intentos rechazados por el bloqueo no lo prolongan, y un inicio de sesión correcto reinicia el conteo de la cuenta.

### Renovar

```http
POST /autenticacion/renovar
X-Solicitado-Con: front
Cookie: token_renovacion=…
```

Devuelve lo mismo que el inicio de sesión, con un token de renovación **nuevo** (rotación). Si el token es inválido, expiró o ya se usó, responde `401 TOKEN_INVALIDO` y borra la cookie. La sesión dura como máximo **7 días**.

### Cerrar sesión y quién soy

```http
POST /autenticacion/cerrar-sesion
Authorization: Bearer <token_acceso>
```
`204` sin cuerpo; revoca la sesión (el token de acceso y la cookie dejan de servir) y borra la cookie.

```http
GET /autenticacion/yo
Authorization: Bearer <token_acceso>
```
`200 { "id": "…", "correo": "…", "nombre": "…" }`.

### Verificar el correo y recuperar la contraseña

Los códigos son de **6 dígitos**, llegan por correo (en español, sin enlaces), duran **15 minutos** y solo sirven una vez. Ninguna de estas rutas entrega tokens: después de verificar o restablecer, el usuario inicia sesión con `iniciar-sesion`.

```http
POST /autenticacion/verificar-correo
{ "correo": "ana@example.com", "codigo": "123456" }
```
`200 { "mensaje": "Correo verificado. Ya puedes iniciar sesión." }`. Si el código es erróneo, vencido, ya usado o el correo no existe: `400 CODIGO_INVALIDO` (siempre el mismo cuerpo).

```http
POST /autenticacion/reenviar-verificacion
{ "correo": "ana@example.com" }
```
`202 { "mensaje": "Si el correo está registrado y sin verificar, te enviamos un código." }`. Responde lo mismo exista el correo, esté ya verificado o no; solo envía correo a una cuenta sin verificar. Supabase Auth no reenvía más de uno por minuto por cuenta.

```http
POST /autenticacion/recuperar
{ "correo": "ana@example.com" }
```
`202 { "mensaje": "Si el correo está registrado, te enviamos un código." }`. Igual exista o no el correo. La respuesta sale **antes** de pedir el código a Supabase Auth, así el tiempo de respuesta no revela si el correo existe.

```http
POST /autenticacion/restablecer
{ "correo": "ana@example.com", "codigo": "123456", "contrasena_nueva": "Zorro#Azul-2026x" }
```
`200 { "mensaje": "Contraseña actualizada. Inicia sesión con la nueva." }`.

- `contrasena_nueva` sigue la misma política que el registro. Si no la cumple (`422 CONTRASENA_INSEGURA`), **el código no se gasta** y puede usarse después con una contraseña válida.
- Al restablecer se **revocan todas las sesiones** del usuario (las cookies y los tokens de acceso anteriores dejan de servir) y llega un correo de aviso de cambio de contraseña.

**Límites de códigos:**

| Límite | Ventana | Respuesta |
|---|---|---|
| 3 solicitudes (`recuperar` o `reenviar-verificacion`) por correo y propósito | 1 hora | `429 DEMASIADOS_INTENTOS` + `Retry-After` |
| 10 solicitudes de código por IP | 1 hora | `429 DEMASIADOS_INTENTOS` + `Retry-After` |
| 5 códigos erróneos por correo y propósito | 15 minutos | `429 CODIGO_BLOQUEADO` + `Retry-After` (también rechaza el código correcto) |
| 20 códigos erróneos por IP | 15 minutos | `429 DEMASIADOS_INTENTOS` + `Retry-After` |

Se cuentan por el texto del correo aunque la cuenta no exista, para no revelar qué correos están registrados. Las peticiones rechazadas por un límite no lo prolongan.

## Errores

Todos los errores, también los de Caddy, tienen este formato:

```json
{ "error": { "codigo": "CONTRASENA_INSEGURA", "mensaje": "La contraseña no cumple los requisitos.",
             "detalles": [ { "campo": "contrasena", "regla": "minimo_12_caracteres", "mensaje": "Debe tener al menos 12 caracteres." } ] } }
```

`detalles` solo aparece en `VALIDACION_FALLIDA` y `CONTRASENA_INSEGURA` (en `restablecer` el campo es `contrasena_nueva`); `reintentar_en_segundos` solo en los `429` de bloqueo y límite.

| Código | HTTP | Cuándo |
|---|---|---|
| `JSON_INVALIDO` | 400 | el cuerpo no es JSON |
| `VALIDACION_FALLIDA` | 422 | campos faltantes, extra, de tipo o formato incorrecto |
| `CONTRASENA_INSEGURA` | 422 | la contraseña incumple la política |
| `CREDENCIALES_INVALIDAS` | 401 | correo inexistente o contraseña incorrecta |
| `TOKEN_INVALIDO` | 401 | token de acceso o de renovación ausente, inválido, expirado o revocado |
| `ORIGEN_NO_PERMITIDO` | 403 | `Origin` distinto de `ORIGEN_FRONT`, o falta `X-Solicitado-Con` en `renovar` |
| `NO_ENCONTRADO` | 404 | ruta fuera de `/autenticacion/<las cinco>` |
| `METODO_NO_PERMITIDO` | 405 | método que la ruta no admite (incluye cabecera `Allow`) |
| `TIPO_CONTENIDO_NO_SOPORTADO` | 415 | `Content-Type` distinto de `application/json` |
| `CUERPO_DEMASIADO_GRANDE` | 413 | cuerpo de más de 10 KB |
| `CORREO_NO_VERIFICADO` | 403 | contraseña correcta en una cuenta sin verificar |
| `CODIGO_INVALIDO` | 400 | código erróneo, vencido, ya usado o de un correo inexistente |
| `CODIGO_BLOQUEADO` | 429 | 5 códigos erróneos del correo en 15 min |
| `CUENTA_BLOQUEADA` | 429 | 5 fallos del correo en 15 min |
| `DEMASIADOS_INTENTOS` | 429 | 20 fallos de la IP en 15 min, límite de solicitudes o de códigos erróneos, o límite de Supabase Auth |
| `ERROR_INTERNO` | 500 | cualquier fallo inesperado, sin detalles internos |

## Conectar un framework de front

1. **CORS.** Pon en `ORIGEN_FRONT` (en `.env`) el origen exacto del front, con esquema, host y puerto (p. ej. `http://localhost:5173` para Vite, `http://localhost:3000` para Next.js, `http://localhost:4200` para Angular) y recrea Caddy: `docker compose up -d caddy`. Cualquier otro `Origin` recibe `403`.
2. **Cookies.** Las peticiones que llevan o reciben la cookie (`iniciar-sesion`, `renovar`, `cerrar-sesion`) deben enviarse con credenciales: `fetch(url, { credentials: 'include' })` o `withCredentials: true` en Axios y Angular.
3. **Token de acceso.** Guárdalo **en memoria** (una variable o el estado del framework), no en `localStorage`. Al recargar la página se recupera llamando a `renovar`.
4. **Renovación.** Llama a `renovar` cuando una petición devuelva `401` o poco antes de que pasen los 900 s. Esa petición debe llevar la cabecera `X-Solicitado-Con: front` (obliga al navegador a hacer el preflight de CORS y es la defensa contra CSRF).
5. **Varias pestañas.** Supabase Auth tolera dos renovaciones con la misma cookie dentro de 10 s; fuera de ese margen la segunda recibe `401`.

```js
const API = 'http://127.0.0.1:8080/autenticacion';
let tokenAcceso = null;

async function iniciarSesion(correo, contrasena) {
  const r = await fetch(`${API}/iniciar-sesion`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, contrasena }),
  });
  const datos = await r.json();
  if (!r.ok) throw datos.error;          // { codigo, mensaje, detalles? }
  tokenAcceso = datos.token_acceso;
  return datos.usuario;
}

async function renovar() {
  const r = await fetch(`${API}/renovar`, {
    method: 'POST', credentials: 'include', headers: { 'X-Solicitado-Con': 'front' },
  });
  if (!r.ok) { tokenAcceso = null; return null; }
  tokenAcceso = (await r.json()).token_acceso;
  return tokenAcceso;
}
```

## Contenido de esta carpeta

| Ruta | Qué es |
|---|---|
| `workflows/` | Los nueve workflows de n8n exportados: `registro-de-usuario`, `inicio-de-sesion`, `renovar-sesion`, `quien-soy`, `cierre-de-sesion`, `verificar-correo`, `reenviar-verificacion`, `recuperar-contrasena`, `restablecer-contrasena` |
| `plantillas/` | Correos en español (verificación, recuperación y aviso de cambio de contraseña); Caddy los sirve a Supabase Auth por la red interna |
| `proxy/Caddyfile` | Rutas, métodos, tipo de contenido, tamaño, CORS, cabeceras de seguridad, IP real y secreto hacia n8n |
| `sql/001_esquema_autenticacion.sql` | Esquema `autenticacion` en la base `n8n` (intentos de inicio de sesión y contraseñas comunes) |
| `sql/002_codigos.sql` | Tabla `eventos_codigo` con los límites de solicitudes y de códigos erróneos |
| `datos/contrasenas_comunes.txt` | Lista de contraseñas comunes (SecLists, con el commit de origen en el encabezado) |
| `pruebas/pruebas.sh` | Pruebas de la API con `curl` |
| `postman/` | Colección y entorno de Postman |

## Operación

**Variables del `.env`:** `ORIGEN_FRONT` y `SECRETO_PROXY` (`openssl rand -hex 32`). `SECRETO_PROXY` es el mismo valor en Caddy y en la credencial `Secreto proxy` de n8n (Header Auth, cabecera `X-Secreto-Proxy`); si lo cambias, actualiza las dos y recrea Caddy.

**Correo (SMTP).** En local, Supabase Auth envía por SMTP a **Mailpit**, un buzón de pruebas que no manda nada a internet: la interfaz y la API están en `http://127.0.0.1:8025` (ahí se ven los códigos). Para usar un SMTP real, cambia en el `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` y `SMTP_SENDER_NAME`, recrea `auth` (`docker compose up -d auth`) y quita el servicio `mailpit` y su puerto. Con Mailpit `SMTP_USER` y `SMTP_PASS` van vacíos (Supabase Auth no manda credenciales por una conexión sin cifrar). Las plantillas están en `plantillas/`: se editan y Caddy las sirve al momento.

**Base de datos** (con el rol de n8n; es idempotente):

```bash
docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -v ON_ERROR_STOP=1 < auth/sql/001_esquema_autenticacion.sql
docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -v ON_ERROR_STOP=1 < auth/sql/002_codigos.sql
grep -v '^#' auth/datos/contrasenas_comunes.txt | docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -c "TRUNCATE autenticacion.contrasenas_comunes" -c "\copy autenticacion.contrasenas_comunes FROM STDIN"
```

**Workflows:** se importan con el CLI de n8n y se publican; n8n debe reiniciarse para registrar los webhooks.

```bash
docker compose cp auth/workflows/registro-de-usuario.json n8n:/tmp/wf.json && docker compose exec -T -u root n8n chmod 644 /tmp/wf.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json --userId=<id del owner>
docker compose exec -T n8n n8n publish:workflow --id=autRegistro01
docker compose restart n8n
```

Ids: `autRegistro01`, `autInicioSesion01`, `autRenovarSesion01`, `autQuienSoy01`, `autCierreSesion01`, `autVerificar01`, `autReenviar01`, `autRecuperar01`, `autRestablecer01`. Los workflows usan las credenciales `Secreto proxy` (`secretoProxy01`) y `Postgres n8n (Supabase)` (`pgSupabase01`); se crean antes con `n8n import:credentials`.

**Las ejecuciones no se guardan.** Cada workflow tiene `saveDataSuccessExecution` y `saveDataErrorExecution` en `none` y el servicio `n8n` borra el contenido en 1 o 2 minutos (`EXECUTIONS_DATA_HARD_DELETE_BUFFER=0`), para que las contraseñas no queden en la base. No pruebes estos workflows con contraseñas reales desde el botón *Execute* del editor: las ejecuciones manuales sí se guardan.

**Pruebas** (con el stack levantado, desde la raíz del repo; tardan unos minutos):

```bash
bash auth/pruebas/pruebas.sh
```

Necesitan Mailpit (leen los códigos de su API) y limpian de las tablas de intentos, de `auth.users` y del buzón lo que crean (usuarios `prueba_sh_*@example.com`).

## Limitaciones conocidas

- **Mailpit solo sirve para desarrollo:** cualquiera que llegue a `127.0.0.1:8025` lee los códigos, y los correos se pierden al reiniciarlo. En producción, SMTP real y sin Mailpit.
- **Códigos de 6 dígitos:** 1 000 000 de combinaciones; lo mitigan los 5 errores por correo y 20 por IP cada 15 minutos y la caducidad de 15 minutos.
- **Límites de Supabase Auth por IP:** todas las llamadas llegan desde n8n (una sola IP), así que `GOTRUE_RATE_LIMIT_VERIFY` y `GOTRUE_RATE_LIMIT_EMAIL_SENT` están en 1000 y los límites reales son los de n8n. Quedan los demás límites por IP de Supabase Auth (p. ej. renovación de tokens y registros/inicios de sesión) compartidos entre todos los usuarios.
- **Fallos del SMTP pasan desapercibidos:** `recuperar` y `reenviar-verificacion` responden `202` antes de enviar; si el SMTP cae, el correo nunca llega y solo se ve en los registros de `auth`.
- **Sin TLS:** la cookie no lleva `Secure` ni hay HSTS; se añaden con un dominio HTTPS.
- **IP en local:** en Docker Desktop todos los clientes locales comparten la IP de la pasarela, así que el límite por IP actúa sobre todos juntos.
- **Reuso de la cookie de renovación:** Supabase Auth tolera reusos dentro de 10 s y devuelve el mismo sucesor mientras nadie lo haya usado; no revoca el resto de la sesión al detectar un reuso.
- **Supabase Auth sigue accesible** por su propia API (`/auth/v1/*` en el puerto 8000, protegido solo por la clave `anon`): quien la use se salta la política de contraseña, los límites y la verificación de códigos propios de esta API (también `recover`, `verify` y `resend`).
