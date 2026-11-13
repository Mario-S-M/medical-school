# Front de la escuela (Astro)

Front estático en Astro 7 con islas React, Tailwind CSS v4, Zustand, TanStack Query (con axios) y Zod que consume la API NestJS de `../api/` (autenticación y escuela: GraphQL y REST). Especificaciones: `../specs/06-frontend-astro-autenticacion.md`, `../specs/07-roles-cursos-secciones-catalogo.md` y `../specs/10-escuela-nestjs-graphql.md`.

## Arrancarlo

Requiere Node 22.23 o superior y el stack levantado (`docker compose up -d`: API, transcodificador, Supabase y Mailpit).

```bash
cd frontend
npm install
npm run dev        # http://localhost:4321
```

El servidor de desarrollo reenvía `/api/*` (REST `/api/v1` y GraphQL `/api/graphql`) a la API NestJS y `/almacen/*` a Supabase Storage (subida y lectura de portadas), así la cookie `token_renovacion` (`SameSite=Strict`) viaja como misma origen. `ORIGEN_FRONT` en el `.env` de la raíz debe valer `http://localhost:4321`.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `URL_API` | `http://127.0.0.1:3000` | Destino del proxy de `/api` (solo la lee `astro.config.mjs`). Ver `.env.example`. |
| `URL_ALMACEN` | `http://127.0.0.1:8000/storage/v1` | Destino del proxy de `/almacen` (subida y lectura de portadas por Kong). |

El proxy solo existe en desarrollo: en producción el front, `/api/*` y `/almacen/*` deben servirse desde el mismo origen.

## Páginas

Públicas: `/` (con los cursos recientes), `/cursos` (catálogo con buscador, filtros y paginación), `/curso?c=<slug>` (ficha con el temario, sin video), `/registro`, `/verificar-correo`, `/iniciar-sesion`, `/recuperar` y `/restablecer`.

Con sesión: `/panel` (con las invitaciones al equipo de apoyo) y `/clase?id=<clase_id>` (reproductor protegido de la clase, ver "Reproductor").

**Enlaces "Ver clase"** (`features/player/components/WatchLink.tsx`, llevan a `/clase?id=<clase_id>`): en la ficha pública `/curso` solo en las clases **muestra** (`PublicSyllabus`, `link="sample"`; un visitante sin sesión que lo pulsa llega a `/iniciar-sesion` porque la página `/clase` exige sesión), en el editor del instructor en cada clase con video `listo` (`VideoLesson`) y en la tarjeta de revisión del administrador en las clases con video listo (`ReviewCard`, `link="video"`, con el booleano `tiene_video` que ahora devuelven `curso` y `cursos_en_revision`; es solo ese dato: ni rutas de Storage ni claves). El permiso real lo decide la API al abrir la clase.

Con rol, protegidas en el cliente con `RoleGuard` (la API vuelve a comprobar el permiso):

| Ruta | Rol |
|---|---|
| `/instructor`, `/instructor/curso?id=` | `instructor` o `equipo_apoyo` (el equipo no cambia los datos del curso) |
| `/instructor/equipo` | `instructor` |
| `/admin/roles`, `/admin/categorias`, `/admin/revision` | `administrador` |

En el editor del curso, cada clase muestra el estado de su video y permite subirlo, reemplazarlo, reintentarlo y borrarlo (recomendación de 2 a 9 minutos, aviso de clase larga hasta 30 minutos y rechazo por encima). Los enlaces *Instructor* y *Admin* de la cabecera aparecen según los roles que devuelve la consulta `mis_roles`.

## Reproductor (`/clase?id=`)

Isla `ClassPlayer` (`features/player/`) con `hls.js` 1.7.4. Exige sesión (`SessionGuard`: sin sesión lleva a `/iniciar-sesion`) y un `id` entero positivo.

- **Autorización.** `usePlayback` llama a `autorizar_reproduccion` (por hash persistido) y guarda el token **solo en memoria** (un `ref`; nunca en `localStorage`, `sessionStorage`, cookies ni URL). Si la API responde `SIN_PERMISO`, `VIDEO_NO_DISPONIBLE` o `NO_ENCONTRADO` se muestra el mensaje en español y no se pide ni la lista ni la clave.
- **Token.** `useHls` crea `Hls` con `xhrSetup`, que añade `Authorization: Bearer` **solo** a las URL del mismo origen que empiezan por `/api/v1/reproducciones/` (lista y clave). Los segmentos van a Storage (`/almacen/...`, URL firmadas) sin cabecera.
- **Renovación.** Al **80 % de `expira_en`** (a los 8 minutos con 600 s), si el video se reproduce, se pide otra autorización y se vuelve a cargar la lista con el token nuevo (`loadSource` + `startLoad(currentTime)`), conservando el segundo y el estado reproduciendo o pausado. Si el video está en pausa a esa hora, se renueva al reanudar (evento `play`). Una URL firmada o un token vencidos (HTTP 401 o 403 en un segmento o en la clave) renuevan la autorización **de inmediato** y reintentan una vez, sin esperar a que `hls.js` agote sus reintentos (unos 30 s con espera creciente); un error de red fatal también renueva y reintenta una vez. Si **la renovación falla** (por ejemplo `SIN_PERMISO` porque la cuenta perdió el acceso), se muestra en español el mensaje del error más "Recarga la página para seguir viendo la clase." y el video sigue solo hasta que venzan sus URL; si el reintento tampoco funciona sale "No se pudo reproducir el video. Recarga la página para intentarlo de nuevo.". La prueba de URL vencida y la de renovación fallida están en `tests/player.spec.ts`.
- **Sin MSE.** Si `Hls.isSupported()` es falso se muestra "Tu navegador no puede reproducir este video. Prueba con otro navegador." (el HLS nativo no permite la cabecera `Authorization`).
- **`<video>`.** `controls`, `controlsList="nodownload nofullscreen noremoteplayback"`, `disablePictureInPicture`, `disableRemotePlayback`, `playsInline` y menú contextual cancelado. La **pantalla completa es la del contenedor** (video y marca de agua juntos) con el botón propio *Pantalla completa* / *Salir*.
- **Marca de agua.** `Watermark` muestra el correo (`marca_agua`) dentro del mismo contenedor que el video, con `pointer-events: none`, opacidad 0,35 y sombra de texto; cambia de posición cada 7 s (en porcentajes con `translate` inverso, así nunca se sale). `useWatermarkGuard` la vigila con un `MutationObserver` y cada 1 s (`lib/watermark-integrity.ts` y módulos hermanos) y **pausa el video** (en menos de 3 s), muestra "La marca de agua se quitó o se ocultó. Recarga la página para continuar.", la restaura (a lo sumo una vez por segundo, para no entrar en un bucle si algo no se puede arreglar) y mientras siga bloqueado el `play` vuelve a pausar. Se considera manipulada si: no es hija directa del contenedor o no está en el DOM; no dice el correo; `display: none` (suyo o de cualquier ancestro) o `visibility` distinta de `visible` (incluida la heredada); la **opacidad efectiva** (la suya por las de todos sus ancestros) es menor de 0,1; el `color` o `-webkit-text-fill-color` tienen alfa menor de 0,1 (`transparent`, `rgba(...,0)`); tiene `filter` con `opacity` o `brightness` menores de 0,1 o `blur` de más de 3 px, `clip-path`, `mask-image` o un `mix-blend-mode` distinto de `normal` (la marca propia no usa ninguno); su letra es menor de 8 px o su caja menor de 8 px de alto; el texto está recortado o cae fuera del contenedor; o **otro elemento la tapa por completo**: `document.elementFromPoint` en el centro del texto (la marca tiene `pointer-events: none`, así que devuelve lo que hay debajo) no es el `<video>`, el contenedor o un ancestro, un control propio (`data-player-ui`) ni la cabecera fija del sitio. **Casos descartados por dar falsos positivos:** la cabecera fija (`<header>` sticky) tapa legítimamente el video al hacer scroll; si el centro de la marca queda fuera de la ventana no se puede comprobar y no cuenta; el botón *Pantalla completa* y el aviso son controles del reproductor. **No se detecta** un elemento tapador con `pointer-events: none` (`elementFromPoint` lo ignora) ni los cambios de color que dejen la marca poco legible sin bajar el alfa; la protección sigue siendo disuasoria.
- **Límite.** La marca vive en el cliente: quien manipule el navegador puede quitarla. Es disuasoria y de trazabilidad (ver la SPEC 12).

## Stack

| Pieza | Uso |
|---|---|
| Zustand | Estado de cliente: la sesión (token de acceso y usuario) en `features/auth/store/session-store.ts`, **solo en memoria** (sin `persist`, `localStorage`, `sessionStorage` ni cookies propias). Al cargar cada página se recupera con `POST /api/v1/sesiones/renovacion`. |
| axios | Un cliente en `shared/api/client.ts` con interceptores: añade `Authorization: Bearer` desde el store, usa la cookie de renovación (mismo origen, `withCredentials`), renueva el token y reintenta una vez ante `TOKEN_INVALIDO`, y convierte todo error (HTTP, red o `errors` de GraphQL con `extensions.codigo`) en `ApiError` (`status`, `code`, `message`, `details`, `retryAfter`, incluido `Retry-After`). Ninguna petición usa `fetch`. La subida de archivos a Storage usa otra instancia sin interceptores (`shared/api/upload.ts`). |
| TanStack Query | Caché y estado del servidor: un `QueryClient` singleton de módulo (`shared/lib/query-client.ts`) compartido por todas las islas de Astro mediante `withQueryClient` (cada isla es un árbol React aparte). Consultas con `useQuery`, acciones con `useMutation` que invalidan el caché afectado; el estado del video hace *polling* cada 3 s mientras está `en_cola` o `procesando`. Al cerrar sesión o cambiar de usuario se hace `queryClient.clear()`. |
| Zod | Esquemas por funcionalidad en `features/*/schemas/`: validan los formularios (mensajes de campo en español) y las respuestas de la API en la capa `api/` (un contrato roto da `RESPUESTA_INVALIDA`). Los campos opcionales o nulos de la API se tratan con `nullish()` y los objetos ignoran claves extra. |
| GraphQL Code Generator | Genera tipos y el manifiesto de consultas persistidas. Toda operación de GraphQL va con axios (`POST /api/graphql`) enviando solo `extensions.persistedQuery.sha256Hash`, sin `query` (`runGraphql` en `shared/api/graphql.ts`). Los errores de GraphQL (`errors[].extensions.codigo` y `detalles`) se convierten en `ApiError`; su `status` lógico sale del código. |

El código de `src/` y de `tests/` está en inglés (archivos en `kebab-case`, componentes en `PascalCase`). Siguen en español el contrato (rutas y campos JSON, códigos y mensajes de error), los textos de la interfaz y las URL de `src/pages/` (el nombre del archivo es la URL).

## Estructura

```text
src/
  pages/                  una página por URL (nombres en español: son las rutas)
  layouts/                BaseLayout
  styles/                 global.css
  features/<feature>/     api/ components/ hooks/ schemas/ (y store/ o lib/ si hace falta)
    auth/                 formularios, SessionGuard, RoleGuard, SessionMenu, UserPanel; session-store; useSession, useRoles, useMe
    catalog/              CourseList, CourseSheet, CatalogFilters, CategoryMenu, PublicSyllabus; useCatalog, useCategories
    courses/              editor del instructor: cursos, temario, portada, estado y envío a revisión
    player/                reproductor de `/clase`: usePlayback, useHls, marca de agua y su vigilancia, pantalla completa
    videos/               video de cada clase: estado, subida con progreso, aviso de clase larga, reintento y borrado
    team/                 equipo de apoyo e invitaciones
    admin/                roles, categorías y revisión de cursos
  shared/
    api/                  client (axios), ApiError, mensajes de error, parseResponse, upload
    components/ui/        Button, SubmitButton, TextField, PasswordField, CodeField, SelectField, TextareaField, CheckboxField, ErrorAlert, SuccessAlert, RuleList
    components/           DeleteButton
    layout/               Header, Footer, AuthCard
    hooks/                useField, useCountdown, useRetryCountdown
    lib/                  query-client, query-keys, withQueryClient, navigate, url-params, zod-validator
    graphql/generated/    tipos generados (no se versiona)
tests/                    Playwright e2e (*.spec.ts) y helpers/ (Mailpit, base de datos, usuarios)
scripts/verificar_tamano.sh, scripts/write-manifest.mjs
```

## Regla de tamaño

Ningún archivo `.astro`, `.tsx` o `.ts` de `src/` pasa de **50 líneas**. Un componente hace una sola cosa y la lógica va en hooks y módulos aparte.

```bash
scripts/verificar_tamano.sh   # falla si alguno la incumple
```

## Pruebas e2e

Corren contra el stack real y leen los códigos desde Mailpit (`127.0.0.1:8025`). Antes de empezar borran los usuarios `e2e-*@ejemplo.test`, lo que dejaron en la escuela de la base `plataforma` (esquema `escuela`: roles, cursos `e2e-*`, equipos, categorías `E2E *` y sus archivos de Storage; no tocan los datos reales) y vacían las tablas de límites (`docker compose exec db psql` con `supabase_admin`; la clave de servicio de Storage se lee de `../.env`, nunca se guarda). Los roles se dan por SQL con `grantRole` (`tests/helpers/database.ts`; el administrador, con `api/scripts/create-admin.sh`). `graphql.spec.ts` comprueba que toda petición a `/api/graphql` lleva solo el hash (sin `query`), que el hash está en el manifiesto y es de esa operación, que el catálogo público no envía token y que no hay rutas `/escuela`.

Hay **68 pruebas** (35 en Chromium y 33 del reproductor en Chrome; un solo worker), un archivo por flujo: autenticación (`register`, `session`, `recovery`), `graphql`, `admin`, `instructor`, `syllabus`, `review`, `cover`, `video`, `catalog`, `team` y `player`. Los de video generan sus MP4 con el `ffmpeg` del contenedor `transcodificador` (hace falta con el stack levantado).

Helpers (`tests/helpers/`): `setup.ts` (`globalSetup`: borra usuarios `e2e-*`, lo que dejaron en la escuela y los límites antes de empezar), `test-base.ts` (cada prueba simula un cliente distinto con `X-Forwarded-For` para no chocar con el límite de 120 peticiones por minuto), `users.ts` (cuentas de prueba registradas y verificadas, `visit`), `mailpit.ts` (lee los códigos del correo), `database.ts` (`grantRole`, `clearLimits`, `cleanSchoolE2E`, categorías de prueba; por `docker compose exec db psql`), `school.ts` (`makeAdmin`, `signInAsAdmin`), `storage.ts` (`deleteByPrefix` en `portadas` y `videos`, con la clave de servicio leída de `../.env`) y `videos.ts` (`generateVideo` y `generateRealVideo` con ffmpeg, y `prepareLesson`) y `player.ts` (abrir una clase, reproducir, registrar peticiones y errores de `hls.js`).

```bash
npx playwright install chromium   # solo la primera vez
npx playwright test               # proyecto "principal" (Chromium) y proyecto "video" (Google Chrome)
```

`player.spec.ts` corre en su propio proyecto (`video`) con **Google Chrome** (`channel: 'chrome'`, hace falta tenerlo instalado): el Chromium que trae Playwright no reproduce H.264/AAC. El proyecto principal lo ignora (`testIgnore`), así que `npx playwright test` corre todo sin duplicar. Esa prueba sube un video real de 22 s, lo deja procesado, publica el curso por SQL y comprueba la reproducción, el token (solo hacia `/api/v1/reproducciones/*`), la marca de agua y su vigilancia (una prueba por manipulación, cada una pausa en menos de 3 s, y otra de que sin manipular no hay falsos positivos en varias reproducciones, en móvil, con scroll y en pantalla completa), la renovación (reescribe `expira_en` a 10 s con `page.route`), la URL firmada vencida (`page.route` responde 403 a los segmentos hasta que se renueva), la renovación fallida, los permisos y la pantalla completa. **Por qué Chrome:** el Chromium de Playwright no trae los códecs propietarios H.264/AAC con los que el transcodificador produce los videos, así que solo Google Chrome (`channel: 'chrome'`, instalado en el equipo) puede reproducirlos. En Chrome el clic de Playwright no activa los controles nativos del video: la prueba da foco al video y pulsa la barra espaciadora.

Otras comprobaciones: `npm run build` (ejecuta el codegen y deja el manifiesto al día), `npx astro check` (0 errores) y `scripts/verificar_tamano.sh`. Las suites de la API (`cd ../api && npm test && npm run test:e2e`) cubren el contrato; ver `../api/README.md`.

## GraphQL y codegen

El front usa **34 operaciones** de GraphQL (12 consultas y 22 mutaciones), todas por hash persistido, más dos firmas REST. Contrato completo en `../api/README.md`; colección de Postman en `../api/postman/medical-school-school.postman_collection.json`.

`npm run codegen` genera los tipos en `src/shared/graphql/generated/` (no se versiona; el escalar `EnteroGrande` es `number`) y escribe el manifiesto de consultas persistidas en `api/graphql/persisted-queries.json` (sí se versiona; compruébalo con `cd ../api && npm run graphql:verificar`). `dev`, `build` y `check` ejecutan el codegen antes.

**Dónde viven las operaciones:** una por archivo en `src/features/<feature>/api/`, `*.query.ts` para consultas y `*.mutation.ts` para mutaciones (el codegen lee ambos patrones). Cada archivo declara el documento con `graphql(...)`, con el mismo nombre que el campo raíz (`mis_roles`, `crear_curso`...), y exporta una función que llama a `runGraphql(documento, variables, esquemaZod)`; Zod valida el campo de `data`. Los hooks de `hooks/` las usan con TanStack Query (`useQuery` y `useMutation`). El catálogo público (`categorias`, `cursos`, `curso`) se pide con `skipAuth`, sin token.

| Feature | Consultas | Mutaciones |
|---|---|---|
| `auth` | `yo`, `mis_roles` | (REST: sesiones, usuarios, códigos) |
| `catalog` | `categorias`, `cursos`, `curso` | |
| `courses` | `mis_cursos`, `curso_edicion` | `crear_curso`, `editar_curso`, `enviar_revision`, `guardar_seccion`, `borrar_seccion`, `guardar_clase`, `borrar_clase`, `mover`, `confirmar_portada` |
| `team` | `mi_equipo`, `mis_invitaciones` | `invitar_equipo`, `cancelar_invitacion`, `quitar_miembro`, `responder_invitacion` |
| `videos` | `estado_video` | `confirmar_subida_video`, `reintentar_video`, `borrar_video` |
| `admin` | `buscar_usuario`, `cursos_en_revision` | `asignar_rol`, `guardar_categoria`, `borrar_categoria`, `resolver_revision`, `retirar_curso` |

Las firmas de subida son REST y no entran al manifiesto: `POST /api/v1/portadas/firmas` (`courses/api/cover-api.ts`) y `POST /api/v1/videos/firmas` (`videos/api/video-api.ts`); el archivo sube directo a Storage con la URL firmada.

**Regenerar el manifiesto:** tras añadir o cambiar una operación, `npm run codegen`, comprobar con `cd ../api && npm run graphql:verificar` y reconstruir el contenedor de la API (`docker compose up -d --build api`), porque en producción solo acepta hashes del manifiesto (otra cosa da `400 CONSULTA_NO_PERMITIDA`). Si cambian las variables de la colección de Postman, `python3 ../api/scripts/generate-school-postman.py`. El caché de TanStack Query se vacía al cerrar sesión o cambiar de usuario.
