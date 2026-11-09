# SPEC 01 — Secretos seguros con openssl para Postgres + n8n

**Estado:** Implementado
**Depende de:** —
**Fecha:** 2026-11-08
**Objetivo:** Generar con openssl, en una sola ejecución sin dejar ningún script en disco, un usuario de Postgres, contraseñas y la clave de cifrado de n8n, escribirlos en `.env` y recrear el stack para que n8n arranque conectado a Postgres con esas credenciales.

## Alcance

**Entra:**
- Generar con `openssl rand`, ejecutado una sola vez desde la terminal, todos los valores secretos del `.env`.
- Usuario de conexión a Postgres generado (`POSTGRES_USER`), es decir, el que usa n8n en su cadena de conexión.
- Contraseña de Postgres, contraseña de pgAdmin y `N8N_ENCRYPTION_KEY` generadas.
- `.env.example` con los nombres de las variables y sin secretos.
- Persistir los datos de Postgres en la carpeta `./postgres` del proyecto (bind mount) en lugar del volumen con nombre `postgres_data`, para que la información no se pierda al recrear contenedores ni al ejecutar `docker compose down -v`.
- Recrear el stack para que la inicialización de Postgres use las credenciales nuevas sobre la carpeta `./postgres` vacía.

**No entra:**
- Migrar a `./postgres` los datos del volumen viejo `postgres_data`: está vacío de datos útiles (0 workflows, 0 credenciales) y se descarta.
- Cambiar a bind mount los volúmenes de n8n (`n8n_data`) y pgAdmin (`pgadmin_data`): siguen como volúmenes con nombre.
- Dejar un script (ni `scripts/generate-secrets.sh` ni ningún otro) en el proyecto: los comandos se ejecutan una vez y no se guardan.
- Una base o usuario aparte para los datos de la app (credencial Postgres dentro de workflows). Irá en otra spec.
- Separar un superusuario de un rol de n8n sin privilegios: se mantiene un solo usuario.
- La cuenta owner de n8n (email/contraseña de login en la UI): se crea a mano en el primer arranque.
- Rotar secretos en caliente sin borrar datos.
- Cambios en `docker-compose.yml` distintos del montaje de datos de Postgres (ya lee todo lo demás desde `.env`).
- TLS, exponer puertos fuera de 127.0.0.1, `.gitignore` (el directorio no es un repo git).

## Modelo de datos

Variables de `.env` (el orden y los comentarios siguen el formato actual):

| Variable | Origen | Formato |
|---|---|---|
| `POSTGRES_USER` | generado | `n8n_` + `openssl rand -hex 4` → p. ej. `n8n_4be17d0a` |
| `POSTGRES_PASSWORD` | generado | `openssl rand -base64 48 \| tr -dc 'A-Za-z0-9' \| head -c 32` (32 alfanuméricos, sin `/+=$` que rompan compose o URLs) |
| `POSTGRES_DB` | se conserva | `n8n` |
| `N8N_ENCRYPTION_KEY` | generado | `openssl rand -hex 32` (64 hex) |
| `GENERIC_TIMEZONE` | se conserva del `.env` actual | `America/Mexico_City` |
| `PGADMIN_DEFAULT_EMAIL` | se conserva del `.env` actual | email actual |
| `PGADMIN_DEFAULT_PASSWORD` | generado | mismo método que `POSTGRES_PASSWORD`, 24 caracteres |

## Plan de implementación

1. **Hacer backup del `.env` actual** a `.env.bak.<YYYYmmdd-HHMMSS>` con `chmod 600`. El stack actual sigue funcionando porque el `.env` aún no cambió.
2. **Generar y escribir el nuevo `.env` en una sola ejecución desde la terminal**, sin guardar ningún archivo de script (comandos `openssl rand` encadenados en la propia línea de comandos):
   - Lee `GENERIC_TIMEZONE`, `PGADMIN_DEFAULT_EMAIL` y `POSTGRES_DB` del `.env` anterior para conservarlos.
   - Genera los valores según la tabla, escribe `.env` y le aplica `chmod 600`.
   - Imprime solo los nombres de las variables generadas y el usuario de Postgres, **nunca las contraseñas ni la clave**.
3. **Crear `.env.example`** con las mismas claves, valores vacíos o de ejemplo, y un comentario que avise de que cambiar `N8N_ENCRYPTION_KEY` invalida las credenciales guardadas en n8n.
4. **Cambiar el montaje en `docker-compose.yml`:** en el servicio `postgres`, sustituir `postgres_data:/var/lib/postgresql` por `./postgres:/var/lib/postgresql` (se conserva el comentario sobre Postgres 18+) y quitar `postgres_data:` de la sección `volumes:`. Crear antes la carpeta `./postgres` vacía.
5. **Recrear el stack:** `docker compose down -v && docker compose up -d`. `down -v` borra el volumen viejo `postgres_data`, `n8n_data` y `pgadmin_data`, pero nunca `./postgres`. Se pierden la cuenta owner de n8n y la config de pgAdmin, lo que se acepta porque hoy hay 0 workflows y 0 credenciales.
6. **Verificar** (ver los criterios de aceptación) y confirmar que no quedó ningún script en el proyecto.

## Criterios de aceptación

- [x] No existe `scripts/` ni ningún archivo `*.sh` nuevo en el proyecto.
- [x] `.env` tiene permisos `600` y existe un `.env.bak.*` con el contenido anterior.
- [x] `POSTGRES_USER` cumple `^n8n_[0-9a-f]{8}$`.
- [x] `POSTGRES_PASSWORD` tiene 32 caracteres `[A-Za-z0-9]` y `PGADMIN_DEFAULT_PASSWORD` tiene 24.
- [x] `N8N_ENCRYPTION_KEY` cumple `^[0-9a-f]{64}$`.
- [x] `GENERIC_TIMEZONE`, `PGADMIN_DEFAULT_EMAIL` y `POSTGRES_DB` conservan los valores anteriores.
- [x] La salida de la generación no contiene ninguna contraseña ni la clave de cifrado.
- [x] `.env.example` existe y no contiene secretos.
- [x] `docker-compose.yml` monta `./postgres:/var/lib/postgresql` en el servicio `postgres` y ya no declara el volumen `postgres_data`.
- [x] Tras el primer arranque, `./postgres` contiene los archivos de datos de Postgres.
- [x] Persistencia: crear una tabla de prueba, ejecutar `docker compose down` (sin `-v`) y `up -d`, y la tabla sigue existiendo; después borrarla.
- [x] Ejecutar `docker compose down -v` no vacía `./postgres`.
- [x] Tras `down -v && up -d`, `docker compose ps` muestra `postgres` como `healthy` y `n8n` en ejecución.
- [x] `docker compose exec postgres psql -U "$POSTGRES_USER" -d n8n -c 'select 1'` funciona, y con el usuario `n8n` falla.
- [x] `docker compose logs n8n` no muestra errores de autenticación con la base de datos, y `http://127.0.0.1:5678` muestra la pantalla para crear el owner.
- [x] pgAdmin (`http://127.0.0.1:5050`) responde en `/browser/` sin pedir login (con `PGADMIN_CONFIG_SERVER_MODE=False` no hay pantalla de acceso, por lo que el email y la contraseña no se usan para entrar).

## Decisiones tomadas y descartadas

- **Tomada: no dejar ningún script.** Los secretos se generan con comandos ejecutados una vez y no se guarda código en el proyecto. **Descartada:** `scripts/generate-secrets.sh` reutilizable; la consecuencia es que una rotación futura exige repetir los comandos a mano.
- **Tomada: bind mount `./postgres` para los datos de Postgres.** La información queda visible en el proyecto y sobrevive a `down -v`. Interpretación de "carpeta /postgres": ruta relativa al proyecto, porque una ruta absoluta en la raíz de macOS no es escribible. **Descartada:** mantener el volumen con nombre `postgres_data`, que `down -v` borra.
- **Tomada: recrear el stack con credenciales nuevas sobre `./postgres` vacía.** Postgres solo aplica `POSTGRES_USER/PASSWORD` al inicializar un directorio de datos vacío, y hoy no hay workflows ni credenciales que perder. **Descartada:** rotar en caliente con `ALTER ROLE`, que tiene más pasos y es frágil.
- **Tomada: un solo usuario de Postgres**, el mismo que usa n8n. Es suficiente en local porque los puertos están en 127.0.0.1. **Descartada:** separar superusuario y rol sin privilegios (se puede hacer en otra spec).
- **Tomada: usuario `n8n_<hex8>`**, que no se adivina y sigue siendo legible en logs. El nombre de la base se queda como `n8n` porque no es un secreto.
- **Tomada: contraseñas solo alfanuméricas.** Se evitan problemas de escape en compose (`$`) y en cadenas de conexión (`/`, `+`, `=`). Con 32 caracteres hay unos 190 bits de entropía.
- **Tomada: regenerar `N8N_ENCRYPTION_KEY`.** Es seguro porque no existen credenciales cifradas. En el futuro, cambiarla invalida las credenciales guardadas.
- **Tomada: la cuenta owner de n8n queda fuera.** Es un login de la UI, no forma parte de la cadena de conexión.
- **Tomada: tocar `docker-compose.yml` solo para el montaje de Postgres.** Ya toma todas las variables de `.env`.

## Riesgos identificados

- **Escribir `.env` con `./postgres` ya inicializada:** n8n y el healthcheck fallan, porque el usuario nuevo no existe en los datos viejos. Como `down -v` no toca `./postgres`, en una rotación futura hay que vaciar esa carpeta a mano. Recuperación: restaurar `.env.bak.*`.
- **Repetir la generación cuando ya haya workflows o credenciales:** se pierden los datos (al vaciar `./postgres`) o las credenciales quedan ilegibles (por la clave nueva).
- **Permisos de `./postgres`:** si Docker no puede escribir en la carpeta, Postgres no arranca. Se comprueba en la verificación.
- **`./postgres` contiene los datos de la base en claro:** no debe subirse a git ni compartirse. Si el proyecto pasa a un repo, añadir `postgres/` y `.env*` al `.gitignore`.
- **Los backups `.env.bak.*` contienen secretos en texto plano.** Mitigación: `chmod 600` y borrarlos una vez verificado el stack.
- **Los comandos pueden quedar en el historial de la shell.** Como solo contienen llamadas a `openssl` y no valores secretos, no filtran nada.
