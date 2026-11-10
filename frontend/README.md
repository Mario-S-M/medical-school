# Front de la escuela (Astro)

Front estático en Astro 7 con islas React y Tailwind CSS v4 que consume la API de `../auth/` (SPEC 04 y 05) y la de la escuela, `../escuela/` (SPEC 07). Especificaciones: `../specs/06-frontend-astro-autenticacion.md` y `../specs/07-roles-cursos-secciones-catalogo.md`.

## Arrancarlo

Requiere Node 22.23 o superior y el stack levantado (`docker compose up -d`: Caddy, n8n, Supabase y Mailpit).

```bash
cd frontend
npm install
npm run dev        # http://localhost:4321
```

El servidor de desarrollo reenvía `/autenticacion/*` y `/escuela/*` a Caddy, y `/almacen/*` a Supabase Storage (portadas), así la cookie `token_renovacion` (`SameSite=Strict`) viaja como misma origen. `ORIGEN_FRONT` en el `.env` de la raíz debe valer `http://localhost:4321`.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `URL_API` | `http://127.0.0.1:8080` | Destino del proxy de `/autenticacion` y `/escuela` (solo la lee `astro.config.mjs`). Ver `.env.example`. |
| `URL_ALMACEN` | `http://127.0.0.1:8000/storage/v1` | Destino del proxy de `/almacen` (subida y lectura de portadas por Kong). |

El proxy solo existe en desarrollo: en producción el front, `/autenticacion/*`, `/escuela/*` y `/almacen/*` deben servirse desde el mismo origen.

## Páginas

Públicas: `/` (con los cursos recientes), `/cursos` (catálogo con buscador, filtros y paginación), `/curso?c=<slug>` (ficha con el temario, sin video), `/registro`, `/verificar-correo`, `/iniciar-sesion`, `/recuperar` y `/restablecer`.

Con sesión: `/panel` (con las invitaciones al equipo de apoyo).

Con rol, protegidas en el cliente con `GuardiaRol` (la API vuelve a comprobar el permiso):

| Ruta | Rol |
|---|---|
| `/instructor`, `/instructor/curso?id=` | `instructor` o `equipo_apoyo` (el equipo no cambia los datos del curso) |
| `/instructor/equipo` | `instructor` |
| `/admin/roles`, `/admin/categorias`, `/admin/revision` | `administrador` |

Los enlaces *Instructor* y *Admin* de la cabecera aparecen según los roles que devuelve `GET /escuela/mis-roles`.

## Estructura

```text
src/
  layouts/              LayoutBase
  pages/                una página por ruta
  componentes/
    estructura/         Cabecera, Pie, TarjetaAuth, MenuSesion
    ui/                 Boton, BotonEnvio, Campo*, Alerta*, ListaReglas
    auth/               formularios, GuardiaSesion, GuardiaRol, PanelUsuario, ListaInvitaciones
    catalogo/           ListaCursos, FiltrosCatalogo, FichaCurso, TemarioPublico, MenuCategorias…
    instructor/         editor del curso, temario, portada, revisión y equipo de apoyo
    admin/              roles, categorías y revisión de cursos
  hooks/                useSesion, useRoles, useCampo, useEnvio, useCatalogo, useCursoEdicion…
  api/                  cliente, una función por endpoint (autenticacion, escuela, temario, revision, portadas, equipo, catalogo), errores y tipos
  sesion/               token en memoria, correo pendiente y parámetros de la URL
  validacion/           correo, nombre, código, contraseña, curso, temario y categoría
pruebas/                Playwright e2e y ayudas (Mailpit, base de datos)
scripts/verificar_tamano.sh
```

El token de acceso vive solo en memoria; al cargar cada página se recupera con `renovar`. Los identificadores van en español y sin acentos.

## Regla de tamaño

Ningún archivo `.astro`, `.tsx` o `.ts` de `src/` pasa de **50 líneas**. Un componente hace una sola cosa y la lógica va en hooks y módulos aparte.

```bash
scripts/verificar_tamano.sh   # falla si alguno la incumple
```

## Pruebas e2e

Corren contra el stack real y leen los códigos desde Mailpit (`127.0.0.1:8025`). Antes de empezar borran los usuarios `e2e-*@ejemplo.test`, lo que dejaron en la escuela (roles, cursos `e2e-*`, categorías `E2E *` y sus portadas de Storage) y vacían las tablas de límites (`docker compose exec db psql` con `supabase_admin`; la clave de servicio de Storage se lee de `../.env`, nunca se guarda). Los roles se dan por SQL con `darRol` (`pruebas/ayudas/base_datos.ts`).

Hay un archivo por flujo: autenticación (`registro`, `sesion`, `recuperacion`), `administracion`, `instructor`, `temario`, `revision`, `portada`, `catalogo` y `equipo`.

```bash
npx playwright install chromium   # solo la primera vez
npx playwright test
```

Otras comprobaciones: `npm run build` y `npx astro check`.
