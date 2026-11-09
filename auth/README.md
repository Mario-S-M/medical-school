# API de autenticación

Login por correo y contraseña. El **backend son workflows de n8n** que delegan en **Supabase Auth** (hash, JWT, sesiones y rotación de tokens); **Caddy** es la única entrada. Definida en `specs/04-api-login-n8n-supabase-auth.md`.

```
front ──► Caddy 127.0.0.1:8080 ──► n8n (webhooks) ──► Supabase Auth (auth:9999) y Postgres (esquema autenticacion)
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

### Registro

```http
POST /autenticacion/registro
Content-Type: application/json

{ "correo": "ana@example.com", "nombre": "Ana", "contrasena": "Zorro#Azul-2026x" }
```

```json
201  { "mensaje": "Cuenta creada. Ya puedes iniciar sesión." }
```

- `correo`: correo válido de hasta 254 caracteres (se guarda en minúsculas).
- `nombre`: 1 a 80 caracteres, sin caracteres de control.
- `contrasena`: ver la política más abajo.
- No se aceptan campos extra.
- Si el correo ya existe, la respuesta es **idéntica** (`201` con el mismo cuerpo) para no revelar qué correos están registrados. El registro **no inicia sesión**: llama después a `iniciar-sesion`.
- Por ahora el correo se autoconfirma; la verificación por email llega con la SPEC 05.

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

## Errores

Todos los errores, también los de Caddy, tienen este formato:

```json
{ "error": { "codigo": "CONTRASENA_INSEGURA", "mensaje": "La contraseña no cumple los requisitos.",
             "detalles": [ { "campo": "contrasena", "regla": "minimo_12_caracteres", "mensaje": "Debe tener al menos 12 caracteres." } ] } }
```

`detalles` solo aparece en `VALIDACION_FALLIDA` y `CONTRASENA_INSEGURA`; `reintentar_en_segundos` solo en los `429` de bloqueo.

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
| `CUENTA_BLOQUEADA` | 429 | 5 fallos del correo en 15 min |
| `DEMASIADOS_INTENTOS` | 429 | 20 fallos de la IP en 15 min, o límite de Supabase Auth |
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
| `workflows/` | Los cinco workflows de n8n exportados: `registro-de-usuario`, `inicio-de-sesion`, `renovar-sesion`, `quien-soy`, `cierre-de-sesion` |
| `proxy/Caddyfile` | Rutas, métodos, tipo de contenido, tamaño, CORS, cabeceras de seguridad, IP real y secreto hacia n8n |
| `sql/001_esquema_autenticacion.sql` | Esquema `autenticacion` en la base `n8n` (intentos de inicio de sesión y contraseñas comunes) |
| `datos/contrasenas_comunes.txt` | Lista de contraseñas comunes (SecLists, con el commit de origen en el encabezado) |
| `pruebas/pruebas.sh` | Pruebas de la API con `curl` |
| `postman/` | Colección y entorno de Postman |

## Operación

**Variables del `.env`:** `ORIGEN_FRONT` y `SECRETO_PROXY` (`openssl rand -hex 32`). `SECRETO_PROXY` es el mismo valor en Caddy y en la credencial `Secreto proxy` de n8n (Header Auth, cabecera `X-Secreto-Proxy`); si lo cambias, actualiza las dos y recrea Caddy.

**Base de datos** (con el rol de n8n; es idempotente):

```bash
docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -v ON_ERROR_STOP=1 < auth/sql/001_esquema_autenticacion.sql
grep -v '^#' auth/datos/contrasenas_comunes.txt | docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -c "TRUNCATE autenticacion.contrasenas_comunes" -c "\copy autenticacion.contrasenas_comunes FROM STDIN"
```

**Workflows:** se importan con el CLI de n8n y se publican; n8n debe reiniciarse para registrar los webhooks.

```bash
docker compose cp auth/workflows/registro-de-usuario.json n8n:/tmp/wf.json && docker compose exec -T -u root n8n chmod 644 /tmp/wf.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json --userId=<id del owner>
docker compose exec -T n8n n8n publish:workflow --id=autRegistro01
docker compose restart n8n
```

Ids: `autRegistro01`, `autInicioSesion01`, `autRenovarSesion01`, `autQuienSoy01`, `autCierreSesion01`. Los workflows usan las credenciales `Secreto proxy` (`secretoProxy01`) y `Postgres n8n (Supabase)` (`pgSupabase01`); se crean antes con `n8n import:credentials`.

**Las ejecuciones no se guardan.** Cada workflow tiene `saveDataSuccessExecution` y `saveDataErrorExecution` en `none` y el servicio `n8n` borra el contenido en 1 o 2 minutos (`EXECUTIONS_DATA_HARD_DELETE_BUFFER=0`), para que las contraseñas no queden en la base. No pruebes estos workflows con contraseñas reales desde el botón *Execute* del editor: las ejecuciones manuales sí se guardan.

**Pruebas** (con el stack levantado, desde la raíz del repo; tardan unos minutos):

```bash
bash auth/pruebas/pruebas.sh
```

Limpian de la tabla de intentos y de `auth.users` lo que crean (usuarios `prueba_sh_*@example.com`).

## Limitaciones conocidas

- **Correo autoconfirmado** hasta la SPEC 05: cualquiera puede registrar un correo ajeno.
- **Sin TLS:** la cookie no lleva `Secure` ni hay HSTS; se añaden con un dominio HTTPS.
- **IP en local:** en Docker Desktop todos los clientes locales comparten la IP de la pasarela, así que el límite por IP actúa sobre todos juntos.
- **Reuso de la cookie de renovación:** Supabase Auth tolera reusos dentro de 10 s y devuelve el mismo sucesor mientras nadie lo haya usado; no revoca el resto de la sesión al detectar un reuso.
- **Supabase Auth sigue accesible** por su propia API (`/auth/v1/*` en el puerto 8000, protegido solo por la clave `anon`): quien la use se salta la política de contraseña y los bloqueos de esta API.
