# Front de autenticación (Astro)

Front estático en Astro 7 con islas React y Tailwind CSS v4 que consume la API de `../auth/` (SPEC 04 y 05). Especificación: `../specs/06-frontend-astro-autenticacion.md`.

## Arrancarlo

Requiere Node 22.23 o superior y el stack levantado (`docker compose up -d`: Caddy, n8n, Supabase y Mailpit).

```bash
cd frontend
npm install
npm run dev        # http://localhost:4321
```

El servidor de desarrollo reenvía `/autenticacion/*` a Caddy, así la cookie `token_renovacion` (`SameSite=Strict`) viaja como misma origen. `ORIGEN_FRONT` en el `.env` de la raíz debe valer `http://localhost:4321`.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `URL_API` | `http://127.0.0.1:8080` | Destino del proxy (solo la lee `astro.config.mjs`). Ver `.env.example`. |

El proxy solo existe en desarrollo: en producción el front y `/autenticacion/*` deben servirse desde el mismo origen.

## Páginas

`/`, `/registro`, `/verificar-correo`, `/iniciar-sesion`, `/recuperar`, `/restablecer` y `/panel` (privada, protegida en el cliente).

## Estructura

```text
src/
  layouts/              LayoutBase
  pages/                una página por ruta
  componentes/
    estructura/         Cabecera, Pie, TarjetaAuth, MenuSesion
    ui/                 Boton, BotonEnvio, Campo*, Alerta*, ListaReglas
    auth/               formularios, GuardiaSesion, PanelProtegido, PanelUsuario, BotonCerrarSesion
  hooks/                useSesion, useCampo, useEnvio, useCuentaRegresiva, useInicioSesion
  api/                  cliente, una función por endpoint, errores y tipos
  sesion/               token en memoria y correo pendiente
  validacion/           correo, nombre, código y reglas de contraseña
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

Corren contra el stack real y leen los códigos desde Mailpit (`127.0.0.1:8025`). Antes de empezar borran los usuarios `e2e-*@ejemplo.test` y vacían las tablas de límites (`docker compose exec db psql` con `supabase_admin`, sin leer secretos).

```bash
npx playwright install chromium   # solo la primera vez
npx playwright test
```

Otras comprobaciones: `npm run build` y `npx astro check`.
