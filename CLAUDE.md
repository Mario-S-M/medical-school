# Reglas del proyecto

## Idioma del código de `api/` y `frontend/` (SPEC 09)
- Archivos, carpetas, clases, funciones y variables van en inglés, con las convenciones de cada herramienta: `kebab-case` con sufijo de pieza en NestJS (`sessions.controller.ts`, `auth.module.ts`) y `PascalCase` en componentes de React.
- `api/` se organiza por módulos de NestJS (`src/modules/<module>/`) y `frontend/` por funcionalidades (`src/features/<feature>/`).
- Siguen en español el contrato público (rutas REST, campos JSON y de GraphQL, códigos y mensajes de error), las tablas y columnas, las variables del `.env` y las URL de las páginas de Astro (`src/pages/`).
- Stack del front: Zustand para el estado, TanStack Query con axios para las peticiones y la caché, y Zod para validar. La API valida con class-validator y DTOs.
