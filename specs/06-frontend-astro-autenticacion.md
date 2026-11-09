# SPEC 06 — Front de autenticación en Astro, con componentes mínimos y pruebas e2e

**Estado:** Implementado
**Depende de:** SPEC 05 (y, a través de ella, SPEC 04, 03, 02 y 01)
**Fecha:** 2026-11-09
**Objetivo:** Crear en `frontend/` un proyecto Astro (última versión) con una plantilla genérica y las pantallas de registro, verificación de correo, inicio de sesión, recuperación de contraseña y panel protegido, que consumen la API de `auth/` y están divididas en componentes, hooks y módulos de, como máximo, 50 líneas cada uno.

## Alcance

**Entra:**
- Proyecto Astro en `frontend/` con la versión más reciente publicada en npm al implementar (hoy `astro@7.4.8`), TypeScript estricto, `@astrojs/react` para las islas interactivas y Tailwind CSS v4 (`@tailwindcss/vite`) para los estilos. Se ejecuta en el host con `npm run dev` en `http://localhost:4321` (`strictPort`); no se añade al compose.
- Sitio **estático** (sin adaptador de servidor). Las páginas privadas se protegen en el cliente con una isla que pide `renovar` al cargar.
- **Proxy del servidor de Astro** (`vite.server.proxy`): el front llama a `/autenticacion/*` en su propio origen y el servidor lo reenvía a Caddy (`http://127.0.0.1:8080`, configurable con `URL_API` en `frontend/.env.example`). Así la cookie `token_renovacion` (`SameSite=Strict`, `Path=/autenticacion`) viaja como misma origen.
- Cambio a lo existente: `ORIGEN_FRONT` pasa de `http://localhost:3000` a `http://localhost:4321` en `.env` y `.env.example`, y se recrea `caddy`.
- Siete páginas en `src/pages/`:
  - `/` — inicio mínimo con cabecera (enlaces distintos con y sin sesión) y pie.
  - `/registro` — `POST /autenticacion/registro`; al terminar lleva a `/verificar-correo`.
  - `/verificar-correo` — código de 6 dígitos (`verificar-correo`) y botón de reenvío (`reenviar-verificacion`).
  - `/iniciar-sesion` — `iniciar-sesion`; ante `403 CORREO_NO_VERIFICADO` lleva a `/verificar-correo` con el correo ya escrito.
  - `/recuperar` — `recuperar`; lleva a `/restablecer`.
  - `/restablecer` — correo, código y contraseña nueva (`restablecer`); al terminar lleva a `/iniciar-sesion`.
  - `/panel` — privada: muestra nombre y correo (`yo`) y el botón de cerrar sesión (`cerrar-sesion`).
- Token de acceso **solo en memoria** (módulo `almacen_sesion`); nunca en `localStorage`, `sessionStorage` ni cookies propias. Al recargar o cambiar de página se recupera con `renovar` (cabecera `X-Solicitado-Con: front`, `credentials: 'same-origin'`).
- Cliente de la API tipado con una función por endpoint y manejo uniforme del formato de error de SPEC 04 (`error.codigo`, `error.detalles`, `Retry-After`). Cada código de error se traduce a un mensaje en español; las reglas de `detalles` se muestran en una lista junto al campo.
- Validación en el cliente solo para ayudar al usuario (formato de correo, código de 6 dígitos, reglas de contraseña en vivo, sin la lista de comunes); la autoridad sigue siendo la API.
- Regla de tamaño: **ningún archivo de `frontend/src/` pasa de 50 líneas**, comprobada por un script. Un componente hace una sola cosa; la lógica va en hooks y módulos aparte.
- Accesibilidad básica: cada campo con `label`, errores anunciados con `aria-live`, foco visible y navegación completa con teclado.
- Pruebas e2e con Playwright contra el stack real (Caddy + n8n + Supabase Auth + Mailpit); leen los códigos desde la API de Mailpit (`127.0.0.1:8025`).
- `frontend/README.md` con cómo arrancarlo, la estructura de carpetas y la regla de tamaño.

**No entra:**
- Login con Google, Apple y Facebook (spec aparte, el antiguo "SPEC 06" de SPEC 04/05).
- Landing de marketing (hero, precios, características), marca propia, modo oscuro e internacionalización.
- SSR, adaptador de Node y middleware de Astro; despliegue, Dockerfile y servicio del front en el compose.
- Cambiar contraseña o correo con la sesión iniciada, 2FA, borrado de cuenta y edición de perfil.
- TLS, HSTS y el atributo `Secure` de la cookie (ya fuera de SPEC 04).
- Pruebas unitarias (Vitest) y pruebas de accesibilidad automatizadas.
- Cerrar el acceso directo a Supabase Auth por Kong (riesgo ya anotado en SPEC 04).

## Modelo de datos

El front no persiste datos ni introduce tablas. El estado vive en memoria del navegador, y el único dato guardado entre páginas es el correo pendiente de verificar.

**Estado de sesión** (`src/sesion/almacen_sesion.ts`, en memoria):

```ts
type Sesion = { token_acceso: string; usuario: { id: string; correo: string; nombre: string } };
// estados: 'cargando' | 'autenticada' | 'anonima'
```

**Correo pendiente:** `sessionStorage['correo_pendiente']` guarda solo el correo (nunca contraseñas ni códigos) para precargarlo en `/verificar-correo` y `/restablecer`; se borra al verificar.

**Estructura de `frontend/`** (cada archivo de `src/` ≤ 50 líneas):

```text
frontend/
  package.json, astro.config.mjs, tsconfig.json, playwright.config.ts, .env.example, README.md
  scripts/verificar_tamano.sh          # falla si un archivo de src/ pasa de 50 líneas
  pruebas/                             # Playwright (un archivo por flujo) + ayudas (mailpit, base de datos)
  src/
    layouts/LayoutBase.astro
    pages/                             # index, registro, verificar-correo, iniciar-sesion, recuperar, restablecer, panel
    componentes/estructura/            # Cabecera, Pie, MenuSesion, TarjetaAuth (.astro / .tsx)
    componentes/ui/                    # Boton, CampoTexto, CampoContrasena, CampoCodigo, AlertaError, AlertaExito, ListaReglas
    componentes/auth/                  # FormularioRegistro, FormularioVerificarCorreo, FormularioInicioSesion,
                                       # FormularioRecuperar, FormularioRestablecer, PanelUsuario, BotonCerrarSesion, GuardiaSesion
    hooks/                             # useSesion, useEnvio, useCampo, useCuentaRegresiva
    api/                               # cliente.ts, autenticacion.ts, errores.ts, tipos.ts
    sesion/almacen_sesion.ts
    validacion/                        # correo.ts, contrasena.ts, codigo.ts
```

Los identificadores van en español y sin acentos (`FormularioInicioSesion`, `token_acceso`, `correo_pendiente`), excepto lo que imponen Astro y React (`src/pages`, `index.astro`, hooks `use*`).

**Traducción de errores** (`src/api/errores.ts`; cualquier código no listado muestra el mensaje genérico `Algo salió mal. Inténtalo de nuevo.`):

| Código de la API | Qué hace el front |
|---|---|
| `VALIDACION_FALLIDA`, `CONTRASENA_INSEGURA` | muestra cada regla de `detalles` junto al campo |
| `CREDENCIALES_INVALIDAS` | "Correo o contraseña incorrectos." |
| `CORREO_NO_VERIFICADO` | guarda `correo_pendiente` y lleva a `/verificar-correo` |
| `CODIGO_INVALIDO` | "El código no es válido o venció." |
| `CUENTA_BLOQUEADA`, `CODIGO_BLOQUEADO`, `DEMASIADOS_INTENTOS` | bloquea el botón con una cuenta regresiva según `Retry-After` / `reintentar_en_segundos` |
| `TOKEN_INVALIDO` (en `panel`) | pasa a `anonima` y lleva a `/iniciar-sesion` |
| `ORIGEN_NO_PERMITIDO`, `ERROR_INTERNO`, fallo de red | mensaje genérico |

**Variables:** `URL_API` en `frontend/.env.example` (por defecto `http://127.0.0.1:8080`, solo la lee `astro.config.mjs`). Ningún secreto llega al front.

## Plan de implementación

1. **Proyecto base.** Crear `frontend/` con la plantilla mínima de Astro (`npm create astro@latest`), comprobar que la versión instalada es la más reciente de npm y que Node 24 es compatible, añadir React y Tailwind v4, y `scripts/verificar_tamano.sh`. Comprobar: `npm run dev` sirve `http://localhost:4321` y `npm run build` termina sin errores.
2. **Origen y proxy.** Cambiar `ORIGEN_FRONT` a `http://localhost:4321` en `.env` y `.env.example`, recrear `caddy`, y configurar el proxy `/autenticacion` → `URL_API` en `astro.config.mjs`. Comprobar: `curl http://localhost:4321/autenticacion/yo` devuelve el `401 TOKEN_INVALIDO` de la API y `auth/pruebas/pruebas.sh` sigue saliendo con 0.
3. **Layout y piezas de interfaz.** `LayoutBase`, `Cabecera`, `Pie`, `TarjetaAuth`, la página `/` y los componentes de `componentes/ui/`. Comprobar: `/` se ve en el navegador y el script de tamaño pasa.
4. **Cliente de la API y sesión.** `api/` (cliente con manejo del formato de error y `Retry-After`, una función por endpoint), `almacen_sesion.ts`, `useSesion` y `GuardiaSesion`. Comprobar: desde la consola del navegador, `iniciar-sesion` con un usuario de prueba guarda el token solo en memoria.
5. **Registro y verificación.** `validacion/`, hooks de formulario, `FormularioRegistro`, `FormularioVerificarCorreo` (con reenvío y cuenta regresiva) y sus páginas. Comprobar a mano: registrar, leer el código en Mailpit y verificar.
6. **Inicio de sesión y panel.** `FormularioInicioSesion` (con la redirección de `CORREO_NO_VERIFICADO`), `/panel` con `GuardiaSesion`, `PanelUsuario`, `BotonCerrarSesion` y `MenuSesion` en la cabecera. Comprobar a mano: entrar, recargar `/panel` y seguir dentro, salir.
7. **Recuperación de contraseña.** `FormularioRecuperar`, `FormularioRestablecer` y sus páginas. Comprobar a mano: pedir código, restablecer, entrar con la contraseña nueva.
8. **Pruebas e2e y documentación.** Configurar Playwright, escribir los flujos en `frontend/pruebas/` (cada prueba usa un correo único `e2e-<marca de tiempo>@ejemplo.test` y limpia `autenticacion.eventos_codigo` con `psql` antes de empezar), y escribir `frontend/README.md`. Ejecutar la suite completa y repasar los criterios.

## Criterios de aceptación

- [x] `npm run build` en `frontend/` termina con código 0 y `npx astro check` no reporta errores.
- [x] `frontend/package.json` fija `astro` en la versión más reciente publicada en npm el día de la implementación, y usa `@astrojs/react` y `tailwindcss` v4.
- [x] `frontend/scripts/verificar_tamano.sh` termina con código 0: ningún archivo `.astro`, `.tsx` o `.ts` de `frontend/src/` supera 50 líneas.
- [x] `docker compose config -q` pasa y `ORIGEN_FRONT` vale `http://localhost:4321` en `.env.example`; `auth/pruebas/pruebas.sh` sigue terminando con código 0.
- [x] Con `npm run dev` activo, `curl -i http://localhost:4321/autenticacion/yo` devuelve `401` con `TOKEN_INVALIDO`, y `GET http://localhost:4321/webhook/autenticacion/yo` no llega a n8n.
- [x] `npx playwright test` termina con código 0 contra el stack levantado y cubre cada criterio de esta lista que lo permite.
- [x] Registrar un usuario nuevo lleva a `/verificar-correo` con el correo precargado; el código leído de Mailpit lo verifica y el usuario puede iniciar sesión.
- [x] Un código erróneo en `/verificar-correo` muestra "El código no es válido o venció." y no cambia de página; "Reenviar código" deja a Mailpit con un correo nuevo y bloquea el botón con cuenta regresiva.
- [x] Iniciar sesión con una cuenta sin verificar lleva a `/verificar-correo`; con la contraseña incorrecta muestra el mensaje genérico de credenciales.
- [x] Iniciar sesión correcto lleva a `/panel`, que muestra el nombre y el correo del usuario sin pedir nada más.
- [x] Recargar `/panel` con sesión mantiene al usuario dentro (se restaura con `renovar`); abrir `/panel` sin sesión redirige a `/iniciar-sesion`.
- [x] Tras iniciar sesión, `localStorage` y `sessionStorage` no contienen `token_acceso` ni la contraseña (solo `correo_pendiente`, y se borra al verificar), y `document.cookie` no muestra `token_renovacion` (es `HttpOnly`).
- [x] "Cerrar sesión" lleva a `/iniciar-sesion`; después, `/panel` redirige de nuevo y la cookie anterior ya no renueva (`401`).
- [x] Un registro con una contraseña débil muestra en una lista cada regla incumplida que devuelve la API, y la lista de reglas en vivo marca como cumplidas las que el cliente comprueba.
- [x] Tras 5 contraseñas incorrectas del mismo correo, el sexto intento muestra el bloqueo con cuenta regresiva y el botón deshabilitado.
- [x] `/recuperar` con un correo registrado y con uno inexistente muestra el mismo mensaje; `/restablecer` con el código de Mailpit y una contraseña válida lleva a `/iniciar-sesion`, y entrar con la nueva funciona y con la vieja da error de credenciales.
- [x] Una sesión abierta antes de `restablecer` queda cerrada: recargar `/panel` en ella redirige a `/iniciar-sesion`.
- [x] Toda la interfaz está en español, cada campo tiene `label` asociado y los mensajes de error están en una región `aria-live`.
- [x] Ningún archivo de `frontend/` (excepto `node_modules`) contiene `SECRETO_PROXY`, `JWT_SECRET`, claves de Supabase ni el email del owner, y `frontend/node_modules` y `frontend/dist` están ignorados por git.
- [x] `frontend/README.md` documenta cómo arrancar el front, la variable `URL_API`, la estructura de carpetas, la regla de 50 líneas y cómo correr las pruebas e2e.

## Decisiones tomadas y descartadas

- **Tomada: React para las islas.** Los formularios necesitan estado, y React permite separar la lógica en hooks de pocas líneas. **Descartadas:** Svelte (ecosistema menor) y Astro con scripts sueltos (estado a mano).
- **Tomada: Tailwind CSS v4.** Las clases viven en cada componente, así que no hay hojas de estilo grandes que contradigan la regla de tamaño. **Descartado:** CSS plano con variables.
- **Tomada: proxy del servidor de Astro hacia Caddy.** La cookie es `SameSite=Strict` y `localhost` y `127.0.0.1` son sitios distintos; con el proxy todo es misma origen y no hay que tocar CORS ni la cookie. **Descartada:** llamar directo a `127.0.0.1:8080`.
- **Tomada: cambiar `ORIGEN_FRONT` a `http://localhost:4321`.** Es el puerto por defecto de Astro, y el `Origin` que ve Caddy es el del navegador aunque pase por el proxy. **Descartado:** mover Astro al 3000 para no tocar el `.env`.
- **Tomada: sitio estático con guardia en el cliente.** Encaja con el modelo de la API (token en memoria, renovación por cookie) sin añadir un servidor. **Descartada:** SSR con `@astrojs/node`, que obliga a reenviar y rotar la cookie desde el servidor de Astro.
- **Tomada: token de acceso solo en memoria.** Un XSS no puede leerlo del almacenamiento y la cookie `HttpOnly` recupera la sesión al recargar. **Descartada:** guardarlo en `localStorage`.
- **Tomada: validación en el cliente solo como ayuda.** La API sigue siendo la autoridad y su `detalles` es lo que se muestra al fallar. **Descartada:** duplicar la lista de contraseñas comunes en el front.
- **Tomada: 50 líneas por archivo, verificadas por script.** La regla del usuario ("nada de 300 líneas, lo más corto posible") se vuelve un criterio medible. **Descartada:** dejarla como recomendación.
- **Tomada: todo en español, sin acentos en identificadores**, igual que el resto del repo, salvo lo que imponen Astro y React. **Descartado:** código en inglés.
- **Tomada: solo Playwright e2e contra el stack real.** Es la única forma de probar de verdad la cookie, el proxy y los códigos de Mailpit. **Descartada:** Vitest de unidades (otra spec si hace falta).
- **Tomada: plantilla mínima (inicio + layout base + pantallas de auth).** **Descartada:** landing completa.
- **Tomada: login social fuera.** Va en su propia spec, con el front ya existente.

## Riesgos identificados

- **Astro 7 es reciente:** el paso 1 confirma compatibilidad con Node 24, React y Tailwind v4 (`@tailwindcss/vite`); si alguna integración no existe en esa versión, se ajusta la spec.
- **El proxy solo existe en desarrollo:** `vite.server.proxy` no funciona en el sitio ya construido. Para producción habrá que servir el front y `/autenticacion/*` desde el mismo origen (por ejemplo con Caddy), lo que se resuelve junto con TLS y el despliegue.
- **El límite por IP ve una sola IP:** en local todas las pruebas comparten IP (con Docker Desktop y ahora con el proxy). Los límites de 10 solicitudes de código por hora y 20 errores por 15 minutos pueden frenar las pruebas e2e, por eso se limpia `eventos_codigo` antes de cada ejecución.
- **Parpadeo en páginas privadas:** al ser estático, `/panel` se carga antes de saber si hay sesión; se muestra un estado `cargando` y no se pinta contenido privado hasta la respuesta de `renovar`. Los datos privados nunca están en el HTML estático.
- **La sesión se recupera en cada carga de página** (el token está en memoria y las páginas son independientes): cada navegación a una página privada hace una llamada a `renovar`, que rota el token de renovación. Dos pestañas renovando a la vez se cubren con el intervalo de reutilización de 10 s de Supabase Auth.
- **Un XSS seguiría pudiendo llamar a la API con la cookie del usuario:** `HttpOnly` impide leerla, no usarla. Se mitiga con la `Content-Security-Policy` de Caddy y sin `dangerouslySetInnerHTML`; el riesgo no desaparece.
- **El correo pendiente en `sessionStorage` es un dato personal:** vive solo en la pestaña y se borra al verificar.
- **Playwright descarga navegadores** (cientos de MB) y las pruebas dependen de que el stack y Mailpit estén levantados.
- **Las reglas de contraseña del cliente pueden quedar desfasadas** respecto de la API; por eso el mensaje definitivo siempre sale de `detalles`.
- **Cuentas de prueba:** cada ejecución de e2e crea usuarios `e2e-*@ejemplo.test` que quedan en `auth.users`; se pueden borrar por ese patrón.
