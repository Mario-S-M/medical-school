# SPEC 11 — Borrar n8n del proyecto

**Estado:** Implementado
**Depende de:** SPEC 10 (y, a través de ella, SPEC 09, 08, 07, 06, 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-12
**Objetivo:** Eliminar n8n por completo del proyecto (servicio, carpetas, workflows, credenciales, scripts, variables, base y rol) una vez que la API de NestJS sirve toda la aplicación, dejando un respaldo fuera del repositorio.

## Por qué existe esta spec

El usuario pidió "borra todo lo de n8n". Se decidió hacerlo **al final**, cuando la escuela, los videos y la autenticación ya viven en NestJS (SPEC 09 y 10), para que la aplicación no deje de funcionar en ningún momento. Es una spec de borrado: no añade funciones.

## Alcance

**Entra:**

- **Respaldo previo, fuera del repositorio:**
  - `pg_dump` completo de la base `n8n` (incluye el esquema `escuela` histórico y las tablas internas de n8n);
  - copia de la carpeta `./n8n/` (configuración y clave de cifrado de n8n);
  - copia del `.env` actual sin imprimirlo.
  Se guardan en una carpeta con fecha fuera del repositorio (la ruta se pide al usuario o, por defecto, `~/respaldos-medical-school/2026-11-12/`) y se informa al usuario de dónde quedaron.
- **Compose:** se quita el servicio `n8n` de `docker-compose.yml`, el montaje `./n8n`, y el montaje de `supabase/volumes/db/n8n.sql` en `supabase/docker-compose.yml` junto con el paso de `USUARIO_BD_N8N` y `CONTRASENA_BD_N8N` al contenedor `db`. Se revisan las dependencias (`depends_on`) de los demás servicios.
- **Archivos y carpetas que se borran:**
  - `n8n/`, `workflows/`;
  - `escuela/workflows/`, `escuela/credenciales/` y los scripts de n8n de `escuela/scripts/` (`generar_workflows.py`, `importar_workflows.sh`, `revisar_notas.py`, `crear_credencial_*.sh`, `generar_postman.py` si solo lee n8n);
  - `escuela/sql/`, ya reemplazado por las migraciones de TypeORM, y `escuela/plantillas/` (ya en `api/templates/`);
  - `supabase/volumes/db/n8n.sql`;
  - la entrada de la base `n8n` en `pgadmin/servers.json`.
  Lo que aún sirva de `escuela/` (`README.md`, pruebas auxiliares, scripts de buckets) se mueve a `api/` o se descarta si ya está cubierto; la carpeta `escuela/` desaparece.
- **Variables del `.env` y `.env.example`:** se quitan `N8N_ENCRYPTION_KEY`, `USUARIO_BD_N8N`, `CONTRASENA_BD_N8N`, `SECRETO_PROXY` y los comentarios que mencionan n8n o Caddy. `GENERIC_TIMEZONE` se conserva si algo la usa. Se confirma por `grep` que la API no las lee antes de borrarlas.
- **Base de datos:** `DROP DATABASE n8n` y `DROP ROLE` del rol de n8n, con el respaldo ya hecho y comprobado (se restaura en una base temporal para verificar que abre).
- **Documentación:** `api/README.md`, `frontend/README.md` y `CLAUDE.md` sin referencias a n8n, salvo la regla de idioma de los workflows, que se retira porque ya no existen. Las specs 01 a 10 se dejan intactas como historia.
- **Comprobación final:** `docker compose up -d` con el proyecto sin n8n, todas las suites en verde y un barrido de `grep` por `n8n` fuera de `specs/`.

**No entra:**

- Borrar el respaldo (lo conserva el usuario).
- Reescribir las specs históricas 01 a 10.
- Cualquier función nueva.
- Quitar Mailpit, pgAdmin o Supabase (siguen en el proyecto).
- Borrar o tocar los datos de `plataforma` y de Supabase.

## Modelo de datos

Esta spec no introduce estructuras nuevas. Elimina la base `n8n` y su rol; las tablas de `plataforma` y de Supabase no cambian.

## Plan de implementación

1. **Verificar que n8n ya no se usa.** Comprobar, con n8n corriendo, que ninguna petición real llega a sus webhooks (sus ejecuciones no crecen mientras se corre la suite completa) y que `grep` no encuentra en `api/`, `frontend/`, `scripts/` ni `docker-compose.yml` ninguna dependencia viva de n8n (`URL_N8N`, `SECRETO_PROXY`, `n8n:5678`). Si algo sigue usando n8n, se detiene la spec y se informa.
2. **Respaldo.** `pg_dump` de la base `n8n`, copia de `./n8n/` y del `.env` en la carpeta con fecha fuera del repositorio. Restaurar el dump en una base temporal y comprobar que contiene el esquema `escuela` y los workflows; borrar la base temporal.
3. **Quitar el servicio.** Retirar `n8n` y sus montajes del compose, `n8n.sql` y las variables del contenedor `db`; `docker compose up -d --remove-orphans`. Comprobar que `docker compose ps` no lista `n8n`, que nada queda `unhealthy` y que el puerto 5678 ya no responde.
4. **Borrar archivos y variables.** `git rm -r` de las carpetas y archivos listados, limpiar `.env.example` y `.env`, y `pgadmin/servers.json`. Mover a `api/` lo que aún sirva de `escuela/` y borrar `escuela/`.
5. **Borrar la base y el rol.** `DROP DATABASE n8n` y `DROP ROLE`, tras confirmar el respaldo. Comprobar que `plataforma` y Supabase siguen intactos (conteos).
6. **Documentación y barrido final.** Limpiar READMEs y `CLAUDE.md`, ejecutar todas las suites y repasar los criterios.

## Criterios de aceptación

- [x] Existe un respaldo con fecha fuera del repositorio (`~/respaldos-medical-school/2026-11-13/`) con el `pg_dump` de `n8n`, la carpeta `n8n/`, el `.env`, `escuela/` y `workflows/`, y el dump se restauró en una base temporal sin errores antes de borrar nada. El usuario recibió la ruta (fase A, verificada por el usuario).
- [x] `docker compose config -q` pasa, `docker compose ps` no lista `n8n` ni servicios `unhealthy`, y `curl` al puerto 5678 no responde.
- [x] Las carpetas `n8n/`, `workflows/`, `escuela/` y el archivo `supabase/volumes/db/n8n.sql` no existen.
- [x] La base `n8n` y su rol no existen (`\l` y `\du` en `db`), y `plataforma` y la base `postgres` conservan sus conteos de usuarios, cursos, secciones, clases y videos (conteos por tabla idénticos antes y después del `DROP`).
- [x] `.env` y `.env.example` no contienen `N8N_ENCRYPTION_KEY`, `USUARIO_BD_N8N`, `CONTRASENA_BD_N8N` ni `SECRETO_PROXY`, y la API arranca y pasa su suite sin ellas.
- [x] `git grep -il n8n -- . ':!specs'` y `git ls-files --others --exclude-standard` (sin `specs/`) devuelven cero coincidencias. Solo quedan menciones en archivos ignorados por git y ajenos al alcance: `.env.bak.*` (copias del usuario con secretos, no se tocan) y `.playwright-mcp/` (capturas antiguas de herramientas).
- [x] `npm test` y `npm run test:e2e` de `api/`, y `npx playwright test`, `npm run build` y `npx astro check` de `frontend/` terminan con código 0 sin n8n.
- [x] Registro, verificación de correo, inicio de sesión, recuperación, un curso de punta a punta (crear, temario, portada, equipo, subir video, revisión, publicación y ficha pública) funcionan con el stack levantado desde cero (`docker compose down` sin `-v` y `up -d --build`), y los correos llegan a Mailpit (cubierto por las suites de Playwright y e2e: verificación, recuperación, cambio de contraseña e invitación).

## Decisiones tomadas y descartadas

- **Tomada: borrar n8n al final, por decisión del usuario, después de migrar todo.** **Descartados:** borrarlo antes (dejaba la escuela y los videos rotos) y borrar solo la autenticación.
- **Tomada: respaldo fuera del repositorio antes de cualquier borrado.** El `.env` y la clave de cifrado de n8n no deben acabar en git, y el borrado de la base es irreversible. **Descartado:** borrar sin respaldo.
- **Tomada: las specs 01 a 10 no se tocan.** Son la historia de por qué existió n8n. **Descartado:** reescribirlas.
- **Tomada: se retira la regla de idioma de los workflows de `CLAUDE.md`** porque ya no hay workflows. La regla de código en inglés se queda.
- **Tomada: el respaldo se restaura en una base temporal antes de borrar.** Un dump que no abre no es un respaldo.

### Notas de implementación

- **Respaldo:** quedó en `~/respaldos-medical-school/2026-11-13/` (no `2026-11-12`), e incluye también `escuela/` y `workflows/`.
- **`escuela/` se borró entera.** Nada quedó por mover: los scripts de buckets y de administrador ya existían en `api/scripts/`, la plantilla en `api/templates/` y el Postman nuevo en `api/postman/`; la colección vieja y `generar_postman.py` se descartaron.
- **`api/scripts/copy-school-data.sh` y `api/test/school-copy.e2e-spec.ts` se eliminaron** (la base origen desaparece) junto con su sección en `api/README.md`.
- **`transcodificador/pruebas/pruebas.sh`** llama ahora al transcodificador desde el contenedor `api` usando su propio `SECRETO_TRANSCODIFICADOR` (sin imprimirlo): 31 de 31 casos correctos.
- **Variables:** se quitaron `N8N_ENCRYPTION_KEY`, `USUARIO_BD_N8N`, `CONTRASENA_BD_N8N`, `SECRETO_PROXY` y `GENERIC_TIMEZONE` (ningún compose ni la API la usaba). El bloque de proxy TLS (Caddy/Nginx) de `.env.example` es de Supabase y se conserva. `pgadmin/servers.json` no mencionaba n8n.
- **Fuera del alcance:** los `.env.bak.*` de la raíz son copias del usuario con secretos; no se borran ni se modifican.
- **Pendiente menor:** algunos comentarios de `api/src` aún dicen "como el workflow X" (sin nombrar n8n) y podrían reescribirse en una limpieza aparte.

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Algo todavía depende de n8n y se rompe al borrarlo | El paso 1 busca dependencias y comprueba que no llega tráfico a n8n con la suite completa corriendo; si algo aparece, la spec se detiene |
| Pérdida de datos históricos de n8n (ejecuciones, credenciales) | Respaldo fuera del repositorio, verificado con una restauración de prueba |
| El `.env` en el respaldo contiene secretos | El respaldo queda en una carpeta del usuario, no en el repositorio, y no se imprime |
| `DROP DATABASE` falla por conexiones abiertas | Se detiene el servicio n8n antes y se cierran las sesiones restantes con `pg_terminate_backend` |
| Un script o prueba sigue apuntando a `escuela/` o a n8n | El barrido `grep` final y todas las suites lo detectan |

## Qué **no** hay en esta spec

- Funciones nuevas de cualquier tipo.
- Borrar el respaldo.
- Cambios en `plataforma`, Supabase, Mailpit o pgAdmin.
- Reescribir las specs históricas.
