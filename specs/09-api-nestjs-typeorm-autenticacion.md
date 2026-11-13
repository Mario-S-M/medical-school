# SPEC 09 — API en NestJS con TypeORM: base del proyecto, autenticación en REST, GraphQL protegido y retiro de Caddy

**Estado:** Implementado
**Depende de:** SPEC 08 (y, a través de ella, SPEC 07, 06, 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-12
**Objetivo:** Crear en `api/` un backend NestJS (última versión, Fastify y Mercurius) con TypeORM sobre una base Postgres nueva `plataforma`, que sustituya a los workflows de autenticación de n8n con rutas REST `/api/v1/*`, estrene un endpoint GraphQL protegido con la consulta `yo` y reemplace a Caddy como única entrada.

## Por qué existe esta spec

El usuario pidió cambiar todo lo de n8n a NestJS con TypeORM y Postgres, con la API rediseñada: **GraphQL para el dominio y REST para los bordes**, para que la aplicación sea rápida y fluida, y con el endpoint GraphQL protegido. Supabase Auth y Supabase Storage se quedan; lo que desaparece es n8n (y Caddy).

Son unos 50 workflows, la base, el proxy, el transcodificador y el compose, así que se dividió en tres specs:

| Spec | Contenido |
|---|---|
| 09 (esta) | Proyecto `api/`, base `plataforma`, autenticación en REST, GraphQL con todas sus protecciones y la consulta `yo`, retiro de Caddy y de `auth/`, y el front de autenticación adaptado |
| 10 | **Toda la escuela en NestJS** (roles, cursos, temario, catálogo, revisión, equipo, portadas **y videos**) con GraphQL y REST, y copia de los datos de `escuela` a `plataforma` (ver `specs/10-escuela-nestjs-graphql.md`; los videos entraron aquí porque dependen por clave foránea de cursos y clases) |
| 11 | **Borrado completo de n8n** (servicio, carpetas, workflows, credenciales, scripts, variables, base y rol), con respaldo previo fuera del repositorio (ver `specs/11-borrar-n8n.md`) |

La hoja de ruta de la SPEC 08 se recorre: la reproducción protegida pasa a ser la 12, la inscripción la 13, las preguntas la 14, las rutas la 15 y las estrellas, testimonios, FAQ e IA la 16.

**Regla que heredan la 10 y la 11:** va en **GraphQL** todo lo que es dominio (lecturas y mutaciones de cursos, temario, roles, equipo, revisión, estado de videos). Va en **REST** lo que es borde: autenticación (por las cookies `HttpOnly`), firmas de subida a Storage, webhooks internos y salud.

**Transición:** mientras salen la 10 y la 11, n8n sigue sirviendo `/escuela/*`. NestJS se las reenvía con el secreto del proxy, igual que hacía Caddy, y el front de la escuela no cambia en esta spec.

## Alcance

**Entra:**

- **Proyecto `api/`** con la versión de NestJS más reciente publicada en npm al implementar (anotada en `api/README.md`), sobre **Fastify**. GraphQL con **Mercurius** en modo *code-first*. **TypeORM** (última versión) con el driver `pg`, `synchronize` apagado y **solo migraciones**. Pruebas con **Jest + supertest**.
- **Servicio `api` en `docker-compose.yml`**: Dockerfile multietapa, usuario sin privilegios, `read_only`, `cap_drop: [ALL]`, `no-new-privileges` y `NODE_ENV=production`. Publicado en `127.0.0.1:3000`. Alcanza `auth:9999`, `db:5432` y `n8n:5678` por la red interna. En desarrollo también se puede ejecutar en el host con `npm run start:dev`.
- **Base nueva `plataforma`** en el Postgres de Supabase (contenedor `db`), con el rol `USUARIO_BD_PLATAFORMA` / `CONTRASENA_BD_PLATAFORMA`:
  - `supabase/volumes/db/plataforma.sql` para instalaciones nuevas (como `n8n.sql`);
  - `api/scripts/crear_base_plataforma.sh` para crearla en un volumen ya inicializado.
- **Esquema `autenticacion`** en `plataforma`, creado por una migración de TypeORM con las mismas tablas de las SPEC 04 y 05. Una segunda migración carga `contrasenas_comunes` desde `api/datos/contrasenas_comunes.txt`.
- **REST de autenticación** bajo `/api/v1`. Mantiene el comportamiento de las SPEC 04 y 05: validación estricta, política de contraseña, bloqueos por cuenta e IP, límites de códigos, anti enumeración, mismos cuerpos de respuesta y mismo formato de error.

  | Método y ruta | Sustituye a | Entrada → salida |
  |---|---|---|
  | `POST /api/v1/usuarios` | `registro` | `{ nombre, correo, contrasena }` → igual que hoy |
  | `POST /api/v1/sesiones` | `iniciar-sesion` | `{ correo, contrasena }` → `RespuestaSesion` + cookie |
  | `POST /api/v1/sesiones/renovacion` | `renovar` | cookie + `X-Solicitado-Con: front` → `RespuestaSesion` + cookie rotada |
  | `DELETE /api/v1/sesiones/actual` | `cerrar-sesion` | `Authorization: Bearer` → `204` y borra la cookie |
  | `POST /api/v1/verificaciones-correo` | `verificar-correo` | `{ correo, codigo }` → `200 { mensaje }` |
  | `POST /api/v1/verificaciones-correo/reenvio` | `reenviar-verificacion` | `{ correo }` → `202 { mensaje }` |
  | `POST /api/v1/recuperaciones` | `recuperar` | `{ correo }` → `202 { mensaje }` |
  | `POST /api/v1/recuperaciones/restablecimiento` | `restablecer` | `{ correo, codigo, contrasena_nueva }` → `200 { mensaje }` |
  | `GET /api/v1/salud` | — | → `200 { listo: true }` |

  Las llamadas a Supabase Auth son las mismas que hacen hoy los workflows: `/signup`, `/token`, `/verify`, `/recover`, `/resend`, `/logout` y `/user` en `http://auth:9999`.
- **GraphQL en `POST /api/graphql`** (sin versión), con una sola consulta en esta spec: `yo: Usuario!` (`{ id, correo, nombre }`, los mismos campos que hoy devuelve `/autenticacion/yo`). Sustituye a `GET /autenticacion/yo`. **Protecciones:**
  - **Guardia JWT local:** verifica el token de acceso de Supabase (HS256 con `JWT_SECRET`, `aud = authenticated`, `iss = API_EXTERNAL_URL`, sin caducar) sin llamar a Supabase Auth. Los campos protegidos se marcan con un decorador; un decorador de roles queda listo para la SPEC 10.
  - **Profundidad máxima 8 y costo máximo 1000** por operación.
  - **Consultas persistidas:** con `NODE_ENV=production`, solo se aceptan los hashes del manifiesto `api/graphql/consultas_persistidas.json` que genera el codegen del front. Una consulta completa o un hash desconocido dan `400 CONSULTA_NO_PERMITIDA`. En desarrollo se aceptan consultas completas.
  - **Introspección y GraphiQL** solo en desarrollo.
  - **Solo `POST` con `application/json`**, sin cookies: el token va en `Authorization`, así que no hay superficie CSRF.
  - **Límite de peticiones** compartido con REST.
  - Los errores llevan `extensions.codigo` con los mismos códigos de la API (`TOKEN_INVALIDO`, `SIN_PERMISO`, …).
- **Capa transversal de la API**, que antes hacía Caddy:
  - CORS solo para `ORIGEN_FRONT` con credenciales;
  - cabeceras de seguridad (`nosniff`, `no-store`, `no-referrer`, CSP `default-src 'none'`, sin `Server` ni `X-Powered-By`);
  - `405` con `Allow`, `415` en cuerpos que no son JSON, `413` por encima de 10 KB, `400 JSON_INVALIDO`, `404 NO_ENCONTRADO` y `500 ERROR_INTERNO` sin detalles;
  - IP real del cliente para los bloqueos;
  - `X-Solicitado-Con: front` obligatorio en la renovación.
- **Límite general de peticiones:** 120 por minuto y por IP para REST y GraphQL juntos (`@nestjs/throttler`, en memoria). Al pasarlo, `429 DEMASIADAS_SOLICITUDES` con `Retry-After`. Los bloqueos por cuenta, IP y código de las SPEC 04 y 05 siguen en Postgres.
- **Cookie de renovación** `token_renovacion`: `HttpOnly`, `SameSite=Strict`, 7 días, con `Path=/api/v1/sesiones` (antes `/autenticacion`).
- **Retiro de Caddy:**
  - Se quitan el servicio `caddy` y `auth/proxy/Caddyfile`.
  - **Proxy temporal `/escuela/*`** en NestJS (se quita en la SPEC 11). Reenvía a `http://n8n:5678/webhook/escuela/*` solo las rutas que Caddy permitía. Aplica las mismas reglas de método, `415`, `413`, CORS y la defensa ante respuestas sin `X-Flujo`, y añade `X-Secreto-Proxy` y `X-IP-Cliente` (pisando lo que mande el cliente).
  - **Plantillas de correo:** NestJS sirve `api/plantillas/*.html` en `/plantillas-correo/`. `GOTRUE_MAILER_TEMPLATES_*` de `supabase/docker-compose.yml` pasan de `http://caddy:8081/...` a `http://api:3000/plantillas-correo/...`.
- **Retiro de `auth/`:** los 9 workflows de la carpeta `Autenticacion` se archivan en n8n. `auth/plantillas/` y `auth/datos/` se mueven a `api/` y la carpeta `auth/` se borra. El esquema `autenticacion` de la base `n8n` se elimina (antes se comprueba que ningún workflow de la escuela lo usa).
- **Front** (`frontend/src/`, cada archivo ≤ 50 líneas):
  - `astro.config.mjs` reenvía `/api` y `/escuela` a `URL_API` (por defecto `http://127.0.0.1:3000`), con `xfwd`;
  - `api/cliente.ts` y `api/autenticacion.ts` usan las rutas REST nuevas;
  - `quienSoy` pasa a la consulta GraphQL `yo`, enviada con **axios** y cacheada con **TanStack Query** (ver la reorganización del paso 9), con tipos generados por **GraphQL Code Generator** (`npm run codegen`), que también escribe el manifiesto de consultas persistidas en `api/graphql/`;
  - pantallas, componentes y mensajes no cambian.
- **Reorganización en inglés y por módulos** (*ampliación pedida por el usuario durante la implementación*, paso 9), sin cambiar el contrato:
  - **Nombres en inglés** en todo `api/` y `frontend/`: archivos, carpetas, clases, funciones y variables, siguiendo las convenciones de cada herramienta. Se quedan **en español**: las rutas REST, los campos JSON y de GraphQL, los códigos y mensajes de error, las tablas y columnas, las variables del `.env` y las URL de las páginas de Astro (`/cursos`, `/panel`…), que son el nombre del archivo en `src/pages/`.
  - **`api/` por módulos de NestJS** (`src/modules/<módulo>/` con su `*.module.ts`, `controllers/`, `services/`, `dto/`, `entities/`, `guards/`, `resolvers/`), `src/common/` para lo transversal, `src/config/` y `src/database/migrations/`.
  - **`frontend/` por funcionalidades** (`src/features/<funcionalidad>/` con `api/`, `components/`, `hooks/`, `schemas/`, `store/`) y `src/shared/` para lo común.
  - **Zustand** para el estado de cliente (sesión y token en memoria), **TanStack Query con axios** para peticiones y caché (REST y GraphQL; se quita urql) y **Zod** para validar formularios y respuestas en el front. La API sigue validando con **class-validator** y DTOs, como es habitual en NestJS.
- **Pruebas:**
  - e2e de Jest + supertest en `api/test/` contra la base real y Supabase Auth, que sustituyen a `auth/pruebas/pruebas.sh`;
  - unitarias de la política de contraseña y de los límites;
  - `escuela/pruebas/pruebas.sh` y las ayudas de Playwright (`frontend/pruebas/ayudas/`) apuntan al puerto 3000, a las rutas nuevas y a la base `plataforma`.
- **Documentación:**
  - `api/README.md`: arquitectura, versiones, cómo levantar, migrar y probar, el contrato REST y GraphQL, y la regla REST/GraphQL;
  - colección de Postman en `api/postman/` con las peticiones REST y la consulta `yo`;
  - `frontend/README.md` y `escuela/README.md` actualizados;
  - `CLAUDE.md` actualizado: la regla de idioma de los workflows de n8n queda como está y se añade la regla de código en inglés de `api/` y `frontend/`.

**No entra:**

- Cualquier endpoint de la escuela en NestJS (SPEC 10) o de videos (SPEC 11). `/escuela/*` sigue en n8n detrás del proxy temporal.
- Copiar los datos del esquema `escuela` a `plataforma` (SPEC 10).
- Retirar n8n del compose y mover el webhook del transcodificador (SPEC 11).
- Sustituir Supabase Auth o Supabase Storage.
- Redis, varias instancias de la API o límites compartidos entre procesos.
- Comprobar en cada petición que la sesión sigue abierta (se eligió la verificación local del JWT).
- Suscripciones GraphQL, *DataLoader* y caché de respuestas en el servidor (llegan con la 10, cuando haya relaciones).
- TLS, HSTS y el atributo `Secure` de la cookie (como en las SPEC 04 y 06).
- Cerrar el acceso directo a Supabase Auth por Kong (riesgo ya anotado en la SPEC 04).
- Copiar las tablas `intentos_inicio_sesion` y `eventos_codigo`: son contadores de 24 h y 1 día que se rehacen solos.

## Modelo de datos

**Base `plataforma`** (rol `USUARIO_BD_PLATAFORMA`, dueño de la base). La crean `supabase/volumes/db/plataforma.sql` (solo con `supabase/volumes/db/data` vacío) o `api/scripts/crear_base_plataforma.sh` (idempotente, como superusuario).

**Esquema `autenticacion`** (migraciones en `api/src/migraciones/`). Las tablas son idénticas a `auth/sql/001_esquema_autenticacion.sql` y `002_codigos.sql`:

```sql
CREATE SCHEMA autenticacion;
CREATE TABLE autenticacion.intentos_inicio_sesion (
  id bigserial PRIMARY KEY, correo text NOT NULL, ip inet NOT NULL,
  exitoso boolean NOT NULL, creado_en timestamptz NOT NULL DEFAULT now());
CREATE INDEX intentos_correo_creado_en_idx ON autenticacion.intentos_inicio_sesion (correo, creado_en DESC);
CREATE INDEX intentos_ip_creado_en_idx     ON autenticacion.intentos_inicio_sesion (ip, creado_en DESC);
CREATE TABLE autenticacion.contrasenas_comunes (contrasena text PRIMARY KEY);
CREATE TABLE autenticacion.eventos_codigo (
  id bigserial PRIMARY KEY,
  proposito text NOT NULL CHECK (proposito IN ('verificacion', 'recuperacion')),
  tipo text NOT NULL CHECK (tipo IN ('solicitud', 'error')),
  correo text NOT NULL, ip inet NOT NULL, creado_en timestamptz NOT NULL DEFAULT now());
CREATE INDEX eventos_codigo_correo_idx ON autenticacion.eventos_codigo (correo, proposito, tipo, creado_en DESC);
CREATE INDEX eventos_codigo_ip_idx     ON autenticacion.eventos_codigo (ip, tipo, creado_en DESC);
```

**Entidades de TypeORM** (`api/src/autenticacion/entidades/`): `IntentoInicioSesion`, `ContrasenaComun` y `EventoCodigo`, con `schema: 'autenticacion'` y columnas `snake_case`. Las reglas de bloqueo y de límites de las SPEC 04 y 05 no cambian.

**Migraciones:**

- `CrearEsquemaAutenticacion` crea el esquema anterior.
- `CargarContrasenasComunes` inserta las 10 001 contraseñas de `api/datos/contrasenas_comunes.txt` en minúsculas, ignorando duplicados.
- Se ejecutan con `npm run migracion:ejecutar` al arrancar el contenedor `api`, antes de servir.

**Usuarios y sesiones:** siguen en Supabase Auth (`auth.users`, `auth.sessions`). No se crean tablas propias.

**Esquema GraphQL inicial** (generado en `api/graphql/esquema.graphql`; los campos van en `snake_case`, igual que los cuerpos REST):

```graphql
type Usuario { id: ID!  correo: String!  nombre: String! }
type Query { yo: Usuario! }   # exige sesión
```

**Variables del `.env`:**

- Nuevas: `USUARIO_BD_PLATAFORMA` y `CONTRASENA_BD_PLATAFORMA`, con su línea sin valor en `.env.example`.
- Se reutilizan: `JWT_SECRET`, `API_EXTERNAL_URL`, `ORIGEN_FRONT` y `SECRETO_PROXY`. Este último solo lo usa el proxy temporal `/escuela/*` hasta la SPEC 11.
- El servicio `api` recibe además `NODE_ENV=production` y `PUERTO=3000`.

**Variables del front:** `frontend/.env.example`: `URL_API=http://127.0.0.1:3000`.

**Errores nuevos:**

| Código | HTTP | Cuándo |
|---|---|---|
| `CONSULTA_NO_PERMITIDA` | 400 | en producción, una operación GraphQL que no está en el manifiesto de consultas persistidas |
| `CONSULTA_DEMASIADO_COMPLEJA` | 400 | profundidad mayor que 8 o costo mayor que 1000 |
| `DEMASIADAS_SOLICITUDES` | 429 | más de 120 peticiones por minuto desde la misma IP (con `Retry-After`) |

Los demás códigos (`VALIDACION_FALLIDA`, `TOKEN_INVALIDO`, `CORREO_NO_VERIFICADO`, `ORIGEN_NO_PERMITIDO`, `METODO_NO_PERMITIDO`, `TIPO_CONTENIDO_NO_SOPORTADO`, `CUERPO_DEMASIADO_GRANDE`, `JSON_INVALIDO`, `NO_ENCONTRADO`, `ERROR_INTERNO` y los de bloqueo) se conservan tal cual.

**Estructura y nombres de `api/` y `frontend/`** (la fijó la reorganización del paso 9; hasta entonces el código vive con los nombres en español de los pasos 1 a 8):

- Archivos en inglés y `kebab-case` con el tipo de pieza como sufijo, como en NestJS: `sessions.controller.ts`, `sessions.service.ts`, `user.resolver.ts`, `auth.module.ts`, `code-event.entity.ts`, `jwt.guard.ts`, `login.dto.ts`. Clases en `PascalCase`; variables y funciones en `camelCase`.
- Quedan en español solo el contrato (rutas, campos JSON y GraphQL, códigos y mensajes de error), la base (tablas y columnas), el `.env` y las URL de las páginas de Astro.

```text
api/
  src/
    main.ts, app.module.ts
    config/                      (variables validadas con Zod al arrancar)
    common/                      (filters, guards, pipes, decorators, utils: errores, IP real, límite, cabeceras)
    database/migrations/
    modules/
      auth/                      (controllers, services, dto, entities, policies)
      security/                  (JWT)
      graphql/                   (Mercurius, guard, complejidad, consultas persistidas, resolvers)
      health/
      school-proxy/              (reenvío temporal a n8n, se borra en la SPEC 11)
      mail-templates/            (plantillas HTML estáticas)
  graphql/ (schema.graphql, persisted-queries.json)
  templates/, data/, scripts/, test/, postman/, Dockerfile, README.md
frontend/
  src/
    pages/                       (las URL siguen en español)
    features/<feature>/          (api, components, hooks, schemas, store)
    shared/                      (axios client, query client, ui, utils)
    layouts/, styles/
```

## Plan de implementación

1. **Proyecto, base y salud.**
   - Crear `api/` con NestJS (Fastify), TypeORM y la configuración validada.
   - Crear `supabase/volumes/db/plataforma.sql` y `api/scripts/crear_base_plataforma.sh`, y añadir las dos variables al `.env` y a `.env.example`.
   - Escribir las dos migraciones, `GET /api/v1/salud`, el Dockerfile y el servicio `api` (de momento convive con Caddy).
   - Confirmar con la documentación las opciones exactas de Mercurius para consultas persistidas y límites. Si algo de la spec no se puede, se ajusta la spec antes de seguir.
   - Comprobar:
     - el script crea la base y se puede ejecutar dos veces;
     - las migraciones se aplican y una segunda ejecución no hace nada;
     - `contrasenas_comunes` tiene 10 001 filas;
     - `curl 127.0.0.1:3000/api/v1/salud` da `200`.
2. **Capa transversal.** Filtro de errores con el formato de la SPEC 04, validación con lista blanca (`422 VALIDACION_FALLIDA` con `detalles`, sin campos extra), `405`, `415`, `413`, `400 JSON_INVALIDO`, `404`, CORS, cabeceras de seguridad, IP real y límite de 120 por minuto. Comprobar con `curl` cada código y cabecera.
3. **Registro e inicio de sesión.**
   - Servicio de Supabase Auth, política de contraseña y bloqueos por cuenta e IP.
   - `POST /usuarios`, `POST /sesiones`, `POST /sesiones/renovacion` (cookie y `X-Solicitado-Con`) y `DELETE /sesiones/actual`.
   - Comprobar: registro anti enumeración, contraseña común rechazada, 5 fallos bloquean la cuenta, la renovación rota la cookie y cerrar la sesión invalida la cookie de renovación.
4. **Verificación y recuperación.** Los cuatro endpoints con los límites de `eventos_codigo` y la revocación de todas las sesiones al restablecer. Comprobar con Mailpit: el código llega y verifica, la cuarta solicitud de código en una hora y el sexto código erróneo en 15 minutos dan el error de límite de la SPEC 05, y restablecer cierra todas las sesiones.
5. **GraphQL protegido.** Módulo Mercurius en `/api/graphql`, guardia JWT local, `yo`, profundidad y costo, introspección y GraphiQL solo en desarrollo, solo `POST` JSON, límite de peticiones y errores con `extensions.codigo`. Generar `api/graphql/esquema.graphql`. Comprobar con `curl`:
   - `yo` sin token o con token caducado o mal firmado da `TOKEN_INVALIDO`, y con token válido devuelve el usuario;
   - una consulta de profundidad 9 da `CONSULTA_DEMASIADO_COMPLEJA`;
   - con `NODE_ENV=production`, la introspección está cerrada y una consulta fuera del manifiesto da `CONSULTA_NO_PERMITIDA`.
6. **Front de autenticación.**
   - Proxy de Astro a `URL_API`, rutas REST nuevas en `cliente.ts` y `autenticacion.ts`.
   - Codegen y la consulta `yo` (en este paso con urql; el paso 9 lo cambia por axios y TanStack Query); `npm run codegen` escribe el manifiesto en `api/graphql/`.
   - Ayudas de Playwright apuntando a `plataforma` y al puerto 3000.
   - Comprobar: las pruebas e2e de registro, verificación, sesión y recuperación pasan contra NestJS (Caddy sigue sirviendo `/escuela/*`).
7. **Retiro de Caddy.**
   - Proxy temporal `/escuela/*` con las reglas y cabeceras de Caddy.
   - Servir las plantillas en `/plantillas-correo/` y apuntar `GOTRUE_MAILER_TEMPLATES_*` ahí (recrear `auth`).
   - Quitar el servicio `caddy` y el `Caddyfile`, y pasar la `BASE` de `escuela/pruebas/pruebas.sh` al puerto 3000 con las rutas de sesión nuevas.
   - Comprobar:
     - `escuela/pruebas/pruebas.sh` termina con código 0;
     - toda la suite de Playwright pasa;
     - el correo de verificación que llega a Mailpit usa la plantilla en español.
8. **Retiro de `auth/`.**
   - Mover `auth/plantillas/` y `auth/datos/` a `api/`.
   - Archivar los 9 workflows de `Autenticacion` en n8n.
   - Buscar (`grep`) que ningún workflow de `escuela/` use el esquema `autenticacion` y borrarlo de la base `n8n`.
   - Borrar `auth/` y quitar de `escuela/pruebas/pruebas.sh` los `truncate` sobre la base `n8n`.
   - Comprobar que todo sigue en verde.
9. **Reorganización: inglés, módulos, Zustand, TanStack Query + axios y Zod.**
   - `api/`: renombrar archivos, carpetas, clases, funciones y variables al inglés y moverlos a `src/modules/*`, `src/common/`, `src/config/` y `src/database/migrations/`. Mantener la validación con **class-validator** y DTOs (`*.dto.ts`), con **los mismos códigos, mensajes y `detalles`** que hoy. Los nombres de las migraciones ya aplicadas no pueden cambiar en la tabla `migrations`: se mantiene el nombre registrado o se añade una migración que lo corrija sin perder datos.
   - `frontend/`: renombrar y mover a `src/features/*` y `src/shared/*`. Estado de sesión en un almacén de **Zustand** (token en memoria, nunca en `localStorage`). Cliente **axios** con interceptores (Bearer, `X-Solicitado-Con`, conversión de errores al formato `ApiError`, renovación de sesión) y **TanStack Query** para consultas y mutaciones, también la de GraphQL por hash persistido. Se quita urql. Al cerrar sesión se vacía el caché completo. Zod valida formularios y respuestas.
   - Hacerlo por piezas pequeñas (primero `api/` y después `frontend/`), con todas las suites en verde entre una y otra: `git mv` para conservar el historial.
   - Comprobar: ninguna regresión en `npm test` y `npm run test:e2e` de `api/`, en `escuela/pruebas/pruebas.sh` y en Playwright; un script (`scripts/check-names.sh`) recorre `api/src` y `frontend/src` y falla si encuentra un archivo o una carpeta con nombre en español (salvo `src/pages/` y el contrato).
10. **Pruebas, contrato y documentación.**
   - Suite e2e de Jest en `api/test/` que recorre los criterios de las SPEC 04 y 05 con las rutas nuevas, y las unitarias.
   - Colección de Postman en `api/postman/`, `api/README.md` (con la estructura nueva) y actualización de `frontend/README.md`, `escuela/README.md` y `CLAUDE.md`.
   - Ejecutar todas las suites y repasar los criterios.

## Criterios de aceptación

- [x] `npm test` y `npm run test:e2e` en `api/` terminan con código 0 contra el stack levantado; `npm run build` y `npm run lint` pasan.
- [x] `escuela/pruebas/pruebas.sh` termina con código 0 contra `http://127.0.0.1:3000`.
- [x] `npx playwright test`, `npm run build` y `npx astro check` del front pasan, y `frontend/scripts/verificar_tamano.sh` pasa.
- [x] `docker compose config -q` pasa y `docker compose ps` no muestra ningún servicio `caddy`. El puerto `8080` ya no responde.
- [x] `api/package.json` usa la versión de `@nestjs/core` que `npm view @nestjs/core version` daba al implementar, y la anota en `api/README.md`.
- [x] `api/scripts/create-platform-database.sh` se ejecuta dos veces sin errores. `npm run migration:run` aplicado dos veces deja el mismo esquema, y `select count(*) from autenticacion.contrasenas_comunes` en `plataforma` da 10 001.
- [x] El contenedor `api` corre con un usuario distinto de root, con el sistema de archivos en solo lectura, y solo publica `127.0.0.1:3000`.
- [x] `POST /api/v1/usuarios` con un correo ya registrado responde igual (código y cuerpo) que con uno nuevo. Con una contraseña de la lista de comunes, o con un campo extra, da `422 VALIDACION_FALLIDA` con `detalles`.
- [x] `POST /api/v1/sesiones` con una cuenta sin verificar y la contraseña correcta da `403 CORREO_NO_VERIFICADO`. Con datos válidos devuelve `token_acceso` y la cookie `token_renovacion` con `HttpOnly`, `SameSite=Strict` y `Path=/api/v1/sesiones`.
- [x] 5 inicios de sesión fallidos con el mismo correo en 15 minutos bloquean el sexto aunque la contraseña sea correcta, y lo mismo ocurre con un correo inexistente.
- [x] `POST /api/v1/sesiones/renovacion` sin `X-Solicitado-Con: front` da `403 ORIGEN_NO_PERMITIDO`. Con ella devuelve un token nuevo y rota la cookie, y reutilizar la cookie anterior falla.
- [x] Tras `DELETE /api/v1/sesiones/actual`, la cookie de renovación ya no renueva.
- [x] Los flujos de verificación de correo y de recuperación cumplen los criterios de la SPEC 05 con las rutas nuevas: código por Mailpit, límites de solicitudes y de errores, respuesta igual exista o no el correo, y todas las sesiones revocadas al restablecer.
- [x] Cualquier ruta REST responde `405` con `Allow` ante otro método, `415` a un `POST` sin JSON, `413` a un cuerpo de más de 10 KB, `400 JSON_INVALIDO` a un JSON roto y `404 NO_ENCONTRADO` a una ruta desconocida, siempre con el formato de error uniforme.
- [x] Una petición con un `Origin` distinto de `ORIGEN_FRONT` da `403 ORIGEN_NO_PERMITIDO`. Las respuestas llevan `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` y la CSP, y no llevan `Server` ni `X-Powered-By`.
- [x] La petición 121 de una misma IP en un minuto da `429 DEMASIADAS_SOLICITUDES` con `Retry-After`, tanto en REST (contado por ruta con `@nestjs/throttler`) como en `/api/graphql` (que tiene su propia cubeta de 120 por minuto y por IP).
- [x] `/api/graphql`:
  - [x] `yo` sin token, con un token caducado o con un token firmado con otra clave da un error con `extensions.codigo = TOKEN_INVALIDO`, y con un token válido devuelve `{ id, correo, nombre }`;
  - [x] una consulta de profundidad 9 da `CONSULTA_DEMASIADO_COMPLEJA`;
  - [x] un `GET` da `405` y un `POST` sin `application/json` da `415`.
- [x] Con `NODE_ENV=production`, la introspección (`__schema`) falla, `GET /graphiql` da `404` y una consulta completa que no está en `api/graphql/persisted-queries.json` da `400 CONSULTA_NO_PERMITIDA`, mientras que el hash de `yo` generado por el codegen funciona.
- [x] El front no envía ninguna consulta GraphQL en texto completo: en Playwright, el cuerpo de las peticiones a `/api/graphql` lleva solo el hash persistido.
- [x] Por `http://127.0.0.1:3000`, las rutas `/escuela/*` responden igual que antes por Caddy, incluidos `405`, `415` y `413`. Una ruta de la escuela que no estaba en la lista da `404`, y `/escuela/interno/video-procesado` da `404`.
- [x] El correo de verificación que llega a Mailpit usa `verificacion.html` en español, servida desde `http://api:3000/plantillas-correo/`.
- [x] La carpeta `auth/` no existe, los 9 workflows de `Autenticacion` están archivados en n8n y la base `n8n` ya no tiene el esquema `autenticacion`.
- [x] Ningún archivo de `api/`, `frontend/` ni `escuela/` contiene el valor de `JWT_SECRET`, `SERVICE_ROLE_KEY`, `SECRETO_PROXY` ni de `CONTRASENA_BD_PLATAFORMA`, y `.env.example` incluye `USUARIO_BD_PLATAFORMA` y `CONTRASENA_BD_PLATAFORMA` sin valor.
- [x] `api/` tiene la estructura por módulos de NestJS (`src/modules/<módulo>/`) y `frontend/` la de `src/features/` y `src/shared/`. Archivos, carpetas, clases, funciones y variables están en inglés, y `scripts/check-names.sh` termina con código 0. El contrato (rutas, campos JSON y GraphQL, códigos y mensajes de error, tablas, columnas y variables del `.env`) no cambió: `escuela/pruebas/pruebas.sh` y la suite de Playwright de antes de la reorganización pasan sin modificar sus expectativas.
- [x] `frontend/package.json` incluye `zustand`, `@tanstack/react-query`, `axios` y `zod` y ya no incluye `@urql/*`. Ninguna petición del front sale con `fetch` directo. El token de acceso solo vive en el almacén de Zustand (nunca en `localStorage`, `sessionStorage` ni cookies propias), y tras cerrar sesión el caché de TanStack Query queda vacío (una prueba de Playwright lo comprueba con dos usuarios seguidos).
- [x] La API valida con class-validator y DTOs (`api/package.json` no incluye `zod`); los cuerpos de autenticación usan además funciones puras de `modules/auth/validators/` para conservar byte a byte los mensajes y el orden de `detalles`, y devuelve los mismos `codigo`, `mensaje` y `detalles` que antes: los casos de validación de las suites e2e pasan sin cambios.
- [x] `CLAUDE.md` documenta la regla de código en inglés de `api/` y `frontend/` y conserva la de los workflows de n8n.
- [x] `api/README.md` documenta el contrato REST y GraphQL, la regla REST/GraphQL, las protecciones de GraphQL, cómo regenerar el manifiesto y cómo migrar. La colección de Postman es JSON válido sin secretos.

## Decisiones tomadas y descartadas

**Alcance y división:**

- **Tomada: cambiar n8n por NestJS y conservar Supabase Auth y Storage.** Es el menor riesgo y mantiene el comportamiento ya probado. **Descartados:** auth propio en NestJS y reemplazar todo Supabase.
- **Tomada: dividir en tres specs (base y autenticación, escuela, videos y retiro de n8n).** **Descartadas:** dos specs y una sola spec con unos 50 endpoints.
- **Tomada: migrar por partes, con el front de cada parte en su spec.** n8n sigue sirviendo `/escuela/*` hasta la 10 y la 11. **Descartado:** hacer solo backend y reescribir el front al final, que lo dejaba roto entre medias.

**Contrato:**

- **Tomada: rediseñar la API.** REST con recursos y versión (`/api/v1/usuarios`, `/sesiones`, …) para los bordes y GraphQL para el dominio. **Descartados:** mantener el contrato idéntico y los verbos actuales con prefijo.
- **Tomada: autenticación en REST** por las cookies `HttpOnly` de renovación. **Descartado:** todo en GraphQL.
- **Tomada: `yo` en GraphQL.** Es dato de dominio y sirve para estrenar y probar las protecciones ya en esta spec. **Descartado:** `GET /api/v1/usuarios/yo`.
- **Tomada: GraphQL sin versión en `/api/graphql`.** GraphQL evoluciona añadiendo campos y marcando obsoletos. **Descartado:** `/api/v1/graphql`.
- **Tomada: campos GraphQL en `snake_case`**, igual que los cuerpos REST y los tipos actuales del front (`token_acceso`). **Descartado:** `camelCase`, que obligaba a mapear en el front.

**Rendimiento y protección:**

- **Tomada: Fastify + Mercurius.** Es la combinación más rápida en NestJS y Mercurius trae JIT y consultas persistidas. **Descartados:** Express + Apollo y Fastify + Apollo.
- **Tomada: code-first.** El esquema sale de las clases TypeScript y se escribe en `api/graphql/esquema.graphql` para el codegen. **Descartado:** schema-first, que duplica tipos.
- **Tomada: las cuatro protecciones** (profundidad y costo, consultas persistidas en producción, introspección solo en desarrollo, guardia JWT con roles y límite de peticiones). Las pidió el usuario.
- **Tomada: verificar el JWT en local con `JWT_SECRET`.** Es lo más rápido. Supabase Auth firma con HS256 (`GOTRUE_JWT_SECRET`). **Descartados:** llamar a `auth:9999/user` en cada petición y la caché de 60 s. Consecuencia: un token de acceso de una sesión cerrada vale hasta que caduca (15 min).
- **Tomada: GraphQL Code Generator en el front para los tipos y el manifiesto de consultas persistidas.** Se dejó urql en los pasos 6 a 8 y el paso 9 lo sustituye por TanStack Query con axios (decisión posterior del usuario, abajo). **Descartados:** `fetch` propio sin caché y Apollo Client.
- **Tomada (petición del usuario al implementar): TanStack Query con axios para las peticiones y la caché, Zustand para el estado de cliente y Zod para validar datos.** Un solo caché para REST y GraphQL y una sola forma de manejar errores y cabeceras con interceptores de axios. **Descartado:** mantener urql para GraphQL, que dejaba dos cachés distintos en el mismo front.
- **Tomada (petición del usuario al implementar): la API conserva class-validator** y Zod va solo en el front. Es lo habitual en NestJS y no cambia los mensajes ni los `detalles` de error. **Descartado:** Zod también en la API, que el usuario no quiso.
- **Tomada: el manifiesto de consultas persistidas se genera desde el front y se guarda en `api/graphql/`**, versionado en git. **Descartado:** registrar consultas en tiempo de ejecución (APQ abierto), que no es una lista blanca.
- **Tomada: límite de peticiones en memoria.** Hay una sola instancia de la API. **Descartado:** Redis (otra spec si hay varias instancias).

**Datos:**

- **Tomada: base nueva `plataforma` en el mismo Postgres**, con su propio rol, y esquemas `autenticacion` (09) y `escuela` (10). **Descartados:** seguir en la base `n8n` y un contenedor Postgres aparte.
- **Tomada: solo migraciones de TypeORM, sin `synchronize`.** **Descartado:** `synchronize`, que puede borrar columnas en caliente.
- **Tomada: no copiar los contadores de intentos y códigos.** Duran 24 h y 1 día y se rehacen solos. Solo se vuelve a cargar `contrasenas_comunes`. Los datos de la escuela se copian en la SPEC 10.

**Infraestructura:**

- **Tomada: quitar Caddy ya en esta spec**, por decisión del usuario. NestJS asume CORS, cabeceras, límites y la IP real. Mientras exista n8n, reenvía `/escuela/*` con `X-Secreto-Proxy`. **Descartado:** dejar Caddy solo para `/escuela/*` hasta la 11.
- **Tomada: NestJS sirve las plantillas de correo en `/plantillas-correo/`.** Con Caddy fuera, Supabase Auth necesita otra URL para descargarlas. Las plantillas no tienen secretos. **Descartado:** un servidor de archivos aparte.
- **Tomada: servicio `api` en el compose, publicado en `127.0.0.1:3000`, con `NODE_ENV=production`.** Así la lista blanca de GraphQL se prueba en local. **Descartado:** solo en el host, que obligaba a publicar Supabase Auth y la base.
- **Tomada: carpeta `api/` y se borra `auth/`.** **Descartados:** `servidor/` y conservar `auth/` como histórico.
- **Tomada: Jest + supertest**, por decisión del usuario. **Descartados:** Vitest y mantener `pruebas.sh` con `curl` para la autenticación.

**Nombres:**

- **Tomada (petición del usuario al implementar): el código de `api/` y `frontend/` va en inglés, organizado por módulos (NestJS) y por funcionalidades (front), y el contrato queda en español.** Sigue las convenciones de NestJS y de la comunidad de React y Astro, y no obliga a migrar la base ni a reescribir n8n, Postman y las pruebas. Cambia lo que decían los pasos 1 a 8 y la regla de `CLAUDE.md` para el código. **Descartados:** pasar también el contrato al inglés (rutas, campos, códigos y columnas), que rompía la escuela de n8n, y cambiar solo los nombres de archivo.
- **Tomada: las URL de las páginas de Astro siguen en español** (`/cursos`, `/panel`…), porque el nombre del archivo en `src/pages/` es la URL. **Descartado:** renombrarlas, que cambia los enlaces y las pruebas.

- **Valores fijados por defecto, sin preguntar al usuario, y abiertos a cambio:**
  - sufijos de archivo de NestJS en inglés (`.controller.ts`, `.service.ts`, `.resolver.ts`, `.module.ts`, `.entity.ts`, `.guard.ts`, `.dto.ts`);
  - profundidad máxima 8 y costo máximo 1000;
  - 120 peticiones por minuto y por IP;
  - puerto 3000.

**Notas de implementación** (verificadas en el repaso del paso 10):

- La API conserva **class-validator** con DTOs (el usuario no quiso Zod en la API); Zod, Zustand, TanStack Query y axios van solo en el front, y **urql se quitó**. Los cuerpos de autenticación pasan por funciones puras (`request.validators.ts`) para no cambiar mensajes ni el orden de `detalles`.
- **`@nestjs/throttler` cuenta por ruta**, no con un total global de REST más GraphQL. `/api/graphql` tiene su **propia cubeta** (clave `graphql-<ip>`), contada por petición HTTP. Ambos son 120 por minuto y por IP.
- **10 001 contraseñas comunes** (no 10 000): la lista de SecLists más una línea.
- Nombres reales: `api/scripts/create-platform-database.sh`, `npm run migration:run`, `api/graphql/persisted-queries.json` y `api/graphql/schema.graphql`, `api/templates/`, `api/data/` (la reorganización en inglés del paso 9 cambió los nombres de las rutas del texto original).
- El manifiesto lo escribe `cd frontend && npm run codegen`; `cd api && npm run graphql:verificar` lo comprueba.
- El front guarda en `sessionStorage` solo el correo pendiente de verificar; el token de acceso vive únicamente en el almacén de Zustand.
- Fallo real encontrado y arreglado en el repaso: con GraphQL en la misma app, Fastify contestaba con su JSON propio (`FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_BODY_TOO_LARGE`) a un JSON roto o un cuerpo de más de 10 KB en las rutas REST. Un hook `onSend` en `common/utils/app-setup.ts` lo reescribe al formato uniforme (`400 JSON_INVALIDO`, `413 CUERPO_DEMASIADO_GRANDE`), con la prueba `api/test/rest-with-graphql.e2e-spec.ts`.
- Mientras exista n8n, el esquema `escuela` sigue en la base `n8n` (se copia en la SPEC 10).

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Mercurius no expone una opción exacta para algo pedido (lista blanca estricta, costo) en la versión del momento | El paso 1 lo confirma en la documentación. Si falta, se usa una regla de validación propia o un *hook* `preParsing` y se ajusta la spec |
| IP real: con la API en Docker, las peticiones del proxy de Astro llegan desde la puerta de enlace de Docker y todos los bloqueos por IP caerían sobre la misma | `trustProxy` acotado a la red de Docker y `xfwd: true` en el proxy de Astro. Una prueba e2e comprueba que dos IP de `X-Forwarded-For` se cuentan aparte |
| Un token de una sesión cerrada vale hasta 15 minutos | Decisión aceptada por el usuario. La cookie de renovación sí se invalida al momento |
| Supabase Auth descarga las plantillas al enviar: si `api` está caído, el correo sale con la plantilla por defecto (en inglés) | `auth` depende de `api` en el compose. Un criterio comprueba la plantilla en español |
| El proxy temporal `/escuela/*` puede no replicar todas las reglas de Caddy | `escuela/pruebas/pruebas.sh` y la suite de Playwright completa deben pasar antes de borrar Caddy (paso 7) |
| supertest con Fastify necesita `await app.getHttpAdapter().getInstance().ready()` antes de cada suite | Va en la ayuda común de `api/test/` |
| El manifiesto de consultas persistidas se desincroniza (alguien cambia una consulta del front y no regenera) | `npm run build` del front ejecuta el codegen. Un criterio exige que todas las consultas del front pasen en producción |
| Borrar el esquema `autenticacion` de la base `n8n` puede romper un workflow de la escuela | El paso 8 lo busca con `grep` antes y vuelve a ejecutar todas las suites después |
| `plataforma.sql` solo corre con `supabase/volumes/db/data` vacío | El script `crear_base_plataforma.sh` cubre el volumen existente y lo documenta `api/README.md` |
| La reorganización (paso 9) toca casi todos los archivos y puede romper importaciones, migraciones registradas o el contrato | `git mv` por piezas, suites completas en verde entre una y otra, y los criterios dicen que el contrato no cambia. Los nombres de migraciones ya aplicadas no se tocan sin migración correctiva |
| `JWT_SECRET` ahora vive también en el contenedor `api` | No se publica, no se registra en logs y ningún archivo del repo lo contiene (criterio) |

## Qué **no** hay en esta spec

- Endpoints de la escuela en NestJS y la copia de sus datos (SPEC 10).
- Videos en NestJS, webhook del transcodificador y retiro de n8n (SPEC 11).
- Sustituir Supabase Auth o Storage.
- Redis, varias instancias, suscripciones GraphQL, *DataLoader* y caché de respuestas.
- Comprobar en cada petición que la sesión sigue abierta.
- TLS, HSTS y cerrar el acceso directo a Supabase por Kong.

Cada uno de esos puntos, si llega, va en su propia spec.
