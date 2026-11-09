# SPEC 03 — Supabase self-hosted en docker-compose y n8n sobre su Postgres

**Estado:** Aprobado. 
**Depende de:** SPEC 01, SPEC 02
**Fecha:** 2026-11-09
**Objetivo:** Sustituir el contenedor `postgres` por el stack oficial completo de Supabase self-hosted, todo en `127.0.0.1`. n8n arranca de cero sobre una base `n8n` dentro del Postgres de Supabase, se recrean la credencial y los workflows de SPEC 02 desde los JSON del repo y pgAdmin apunta al nuevo Postgres. Así queda lista la base para el login de SPEC 04.

## Alcance

**Entra:**
- Carpeta `supabase/` con los archivos del `docker/` oficial de Supabase (`docker-compose.yml`, `volumes/api/kong.yml`, `volumes/db/*.sql`, etc.), fijados a un tag de release concreto que se anota en esta spec al implementar.
- `docker-compose.yml` raíz: quita el servicio `postgres`, incluye `supabase/docker-compose.yml` con `include:` (usando el `.env` raíz) y mantiene `n8n` y `pgadmin`.
- Stack oficial completo: db, auth (GoTrue), rest, realtime, storage, imgproxy, meta, functions, analytics, vector, kong, studio y supavisor.
- Un solo `.env` raíz con las variables de Supabase (nombres impuestos por Supabase, como `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`…) generadas con openssl igual que en SPEC 01, sin dejar scripts. Ningún valor por defecto del `.env.example` oficial.
- Rol de Postgres `n8n_<hex8>` (sin superusuario) dueño de la base `n8n`, creado con un SQL de init en `supabase/volumes/db/`. n8n se conecta directo al servicio `db:5432`, no a través de supavisor.
- Todos los puertos publicados en `127.0.0.1` (Kong/Studio, supavisor, n8n, pgAdmin).
- n8n vacío: se crean a mano la cuenta owner y la licencia gratuita. Se recrean la credencial `Postgres n8n (Supabase)`, los workflows `Prueba Postgres` y `Estado base de datos` (importando los JSON de `workflows/`) y la carpeta `Estado` en la UI.
- pgAdmin: `pgadmin/servers.json` apunta a `db`; se recrea el volumen `pgadmin_data` para que lo reimporte.
- `.gitignore`: datos de Supabase (`supabase/volumes/db/data/`, `supabase/volumes/storage/`, logs).
- *Añadido a petición del usuario:* la config de n8n pasa del volumen `n8n_data` a la carpeta `./n8n` (bind mount, gitignored) para que `docker compose down -v` no la borre.
- `.env.example` actualizado con todas las variables nuevas y sin secretos.

**No entra:**
- Migrar los datos actuales de n8n (owner, ejecuciones, licencia): se empieza de cero.
- Borrar `./postgres`: se deja intacta como respaldo, ya sin servicio que la use. Su borrado se decide después.
- Endpoints de login, carpeta `auth/`, Caddy, tablas de usuarios o bloqueos: van en SPEC 04.
- Recuperación de contraseña y SMTP (SPEC 05), y login con Google, Apple y Facebook (SPEC 06).
- TLS o dominio público.
- Endurecer cada servicio de Supabase más allá del compose oficial y de los puertos en `127.0.0.1`.

## Modelo de datos

**Variables nuevas del `.env`** (las de Supabase llevan nombres impuestos por Supabase y quedan exentas de la regla del español):

| Variable | Formato |
|---|---|
| `POSTGRES_PASSWORD` | 32 alfanuméricos (superusuario `postgres` de Supabase) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | JWT HS256 firmados con `JWT_SECRET` (`role` = `anon` / `service_role`), generados con openssl en línea |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | `admin_<hex4>` / 24 alfanuméricos (basic auth de Studio) |
| `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `LOGFLARE_*` | según el `.env.example` oficial, generados con openssl |
| `USUARIO_BD_N8N` / `CONTRASENA_BD_N8N` | `n8n_<hex8>` / 32 alfanuméricos (rol de n8n) |
| `N8N_ENCRYPTION_KEY`, `GENERIC_TIMEZONE`, `PGADMIN_*` | se conservan |

Se eliminan `POSTGRES_USER` y `POSTGRES_DB` de SPEC 01 (ya no hay contenedor `postgres:18.6`).

**SQL de init** (`supabase/volumes/db/n8n.sql`, montado en `docker-entrypoint-initdb.d`):

```sql
CREATE ROLE <USUARIO_BD_N8N> LOGIN PASSWORD '<CONTRASENA_BD_N8N>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE n8n OWNER <USUARIO_BD_N8N>;
```
(Los valores salen del entorno; ningún secreto queda escrito en el archivo versionado.)

**Credencial n8n `Postgres n8n (Supabase)`:** host `db`, puerto `5432`, base `n8n`, usuario y contraseña de `USUARIO_BD_N8N`/`CONTRASENA_BD_N8N`, SSL `disable`.

## Plan de implementación

1. **Respaldo y rama.** Backup de `.env` a `.env.bak.<fecha>` (`chmod 600`). `docker compose down` (sin `-v`). `./postgres` queda intacta.
2. **Traer el compose oficial.** Copiar `docker/` del repo `supabase/supabase` en el tag elegido a `supabase/`, sin su `.env`. Anotar el tag en esta spec. Cambiar todos los `ports:` a `127.0.0.1:`.
3. **Generar secretos.** Una sola ejecución en terminal con openssl (sin scripts) que escribe el `.env` nuevo conservando las variables que se mantienen. Imprimir solo nombres de variables, nunca valores.
4. **Init del rol de n8n.** Añadir `supabase/volumes/db/n8n.sql` (lee los valores del entorno con `\getenv` o con un script de init en shell que no guarda secretos) y montarlo en el servicio `db`.
5. **Compose raíz.** Quitar `postgres`, añadir `include: supabase/docker-compose.yml`, apuntar n8n a `DB_POSTGRESDB_HOST=db` con `USUARIO_BD_N8N`/`CONTRASENA_BD_N8N` y hacer que dependa de `db` sano. Mantener pgAdmin dependiendo de `db`.
6. **Levantar.** `docker compose up -d`, esperar a que todos los servicios estén `healthy` y revisar en los logs de n8n que no haya errores de base de datos.
7. **pgAdmin.** Regenerar `pgadmin/servers.json` (host `db`) y recrear el volumen `pgadmin_data`.
8. **n8n desde cero.** Crear el owner en `http://127.0.0.1:5678`, activar la licencia gratuita, crear la credencial `Postgres n8n (Supabase)`, importar los dos JSON de `workflows/`, reasignar la credencial, crear la carpeta `Estado` y ejecutar ambos workflows.
9. **Re-exportar** los workflows (con la credencial nueva referenciada por id/nombre y sin secretos) y actualizar `.env.example` y `.gitignore`.

## Criterios de aceptación

- [ ] `supabase/` contiene el compose oficial y esta spec anota el tag usado.
- [ ] `docker-compose.yml` ya no tiene el servicio `postgres` ni la imagen `postgres:18.6`, e incluye `supabase/docker-compose.yml`.
- [ ] `docker compose ps` muestra todos los servicios de Supabase, n8n y pgAdmin en ejecución, y los que tienen healthcheck aparecen `healthy`.
- [ ] `docker compose config | grep -E 'published'` solo muestra puertos ligados a `127.0.0.1`.
- [ ] El `.env` tiene permisos `600`, no contiene ningún valor por defecto del `.env.example` oficial (p. ej. `grep -c 'your-super-secret' .env` = 0) y existe `.env.bak.*`.
- [ ] `ANON_KEY` y `SERVICE_ROLE_KEY` se verifican con `JWT_SECRET` (HS256) y tienen `role` `anon` y `service_role`.
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/auth/v1/health -H "apikey: $ANON_KEY"` devuelve `200`.
- [ ] `http://127.0.0.1:8000` pide basic auth y entra a Studio con `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`.
- [ ] En el Postgres de Supabase existe la base `n8n` cuyo dueño es `USUARIO_BD_N8N`, ese rol no es superusuario y las tablas internas de n8n están ahí.
- [ ] n8n arranca sin errores de base de datos en `docker compose logs n8n`.
- [ ] En n8n existen la credencial `Postgres n8n (Supabase)` (*Test connection* correcto), los workflows `Prueba Postgres` y `Estado base de datos` dentro de la carpeta `Estado` y ambos se ejecutan con `success`; `Armar resultado` devuelve `estado = "sano"`.
- [ ] pgAdmin muestra el servidor apuntando a `db` sin registrarlo a mano.
- [ ] `./postgres` sigue existiendo sin cambios.
- [ ] `git status` no muestra datos de Supabase ni `.env`; los JSON re-exportados no contienen contraseñas, usuarios ni el email del owner.

## Decisiones tomadas y descartadas

- **Tomada: Supabase self-hosted con el stack oficial completo.** Lo eligió el usuario. **Descartadas:** Supabase Cloud (resolvía HTTPS para OAuth) y el stack mínimo (menos superficie).
- **Tomada: n8n también sobre el Postgres de Supabase, empezando de cero.** **Descartadas:** mantener el Postgres local para n8n, `pg_dump`/restore y export/import de n8n. Consecuencia: se rehacen a mano el owner, la licencia y la carpeta `Estado`.
- **Tomada: base `n8n` con un rol propio no superusuario**, conectado directo a `db:5432`. Supavisor en modo transacción no es compatible con n8n, y el rol aislado evita que n8n toque los esquemas de Supabase (`auth`, `storage`…).
- **Tomada: `supabase/` + `include:` y un solo `.env`.** Mantiene separado el compose oficial para poder actualizarlo. **Descartada:** fusionar sus ~12 servicios en el compose raíz.
- **Tomada: secretos con openssl sin dejar scripts** (convención de SPEC 01).
- **Tomada: bind mount `./n8n` para `/home/node/.n8n`**, a petición del usuario, con el mismo criterio que `./postgres` en SPEC 01. **Descartada:** mantener `n8n_data`, que `down -v` borra.
- **Tomada: conservar `./postgres` como respaldo.** **Descartada:** borrarla en esta spec.
- **Tomada: pgAdmin se queda**, apuntando a `db`, junto a Studio.
- **Tomada: dividir en 4 specs (03 a 06).** Infra, login, recuperación y social se verifican por separado.

**Decisiones ya cerradas para SPEC 04–06** (registradas aquí para no reabrirlas):
- n8n es siempre el backend: el front solo habla con webhooks de n8n y n8n llama a Supabase Auth por dentro.
- Todo vive en `auth/` (excepción pedida por el usuario a la regla del español): `auth/workflows/`, `auth/sql/`, `auth/proxy/`, `auth/README.md` con el contrato de la API. En la UI de n8n la carpeta se llama `Autenticacion`.
- Caddy delante de n8n: solo expone `/autenticacion/*`, añade la IP real, limita el cuerpo a 10 KB y pone cabeceras de seguridad y CORS (origen configurable; framework de front aún sin decidir).
- Contraseña estricta: 12 a 72 caracteres, mayúscula, minúscula, número y símbolo, que no contenga el email, que no esté en la lista de contraseñas comunes, y se devuelve qué reglas fallaron.
- Bloqueo: 5 fallos por email en 15 min bloquean la cuenta 15 min; 20 por IP en 15 min devuelven HTTP 429.
- Tokens: JWT de acceso corto en el cuerpo + refresh rotativo en cookie HttpOnly; logout revoca.
- Registro público con email, nombre y contraseña, sin roles.
- Las tablas quedan preparadas para proveedores externos (SPEC 06), que necesitan cuentas de desarrollador de Google, Apple y Meta, además de un dominio HTTPS para los callbacks.

## Riesgos identificados

- **Consumo de recursos:** el stack completo de Supabase usa varios GB de RAM; en Docker Desktop puede hacer falta subir el límite.
- **Secretos por defecto:** si queda algún valor del `.env.example` oficial, cualquiera puede firmar JWT válidos. Lo cubre un criterio de aceptación.
- **`SERVICE_ROLE_KEY` salta RLS:** nunca debe llegar al front. En SPEC 04 solo la usa n8n.
- **Studio expuesto con basic auth:** queda solo en `127.0.0.1`.
- **Cambiar `JWT_SECRET` después** invalida `ANON_KEY`, `SERVICE_ROLE_KEY` y todas las sesiones.
- **El init SQL solo corre con el directorio de datos vacío:** para cambiar el rol de n8n hay que vaciar `supabase/volumes/db/data` o hacer `ALTER ROLE` a mano.
- **Actualizar Supabase** implica volver a comparar `supabase/` con el tag nuevo.
- **Imagen Postgres de Supabase (15/17) por debajo de la 18 actual:** no afecta porque se empieza de cero.
