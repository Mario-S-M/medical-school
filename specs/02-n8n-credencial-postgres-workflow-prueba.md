# SPEC 02 — Credencial Postgres en n8n, pgAdmin preconfigurado y workflow de prueba

**Estado:** Aprobado
**Depende de:** SPEC 01
**Fecha:** 2026-11-08
**Objetivo:** Dejar n8n con una credencial Postgres funcional hacia la base `n8n`, pgAdmin con el servidor ya registrado, un workflow de prueba que crea, inserta y lee una tabla en el esquema `pruebas` (`workflows/prueba-postgres.json`), un workflow de estado que comprueba la salud de la base (`workflows/estado/estado-base-de-datos.json`) y una regla en `CLAUDE.md` que exige workflows y variables en español.

## Alcance

**Entra:**
- Credencial Postgres en n8n que apunta a la base `n8n` con `POSTGRES_USER`/`POSTGRES_PASSWORD` del `.env` (host `postgres` dentro de la red de compose).
- Workflow de prueba `Prueba Postgres`: Manual Trigger → crear esquema y tabla `pruebas.prueba_n8n` → insertar una fila → `SELECT` de las filas.
- Vía preferida: MCP de n8n. Si no está disponible o no permite la operación, Playwright sobre la UI en `http://127.0.0.1:5678`.
- pgAdmin con el servidor Postgres pre-registrado vía `servers.json`, para hacer `SELECT` también desde pgAdmin.
- Export del workflow, sin secretos, a `workflows/prueba-postgres.json` versionado en git.
- *Añadido tras la implementación inicial:* `CLAUDE.md` en la raíz del repo con la regla de que todos los workflows y todas las variables van en español.
- *Añadido tras la implementación inicial:* carpeta `workflows/estado/` con el workflow `Estado base de datos`: Manual Trigger → consulta de salud a Postgres → resultado en español (`estado: "sano"`). Si la base no responde, la ejecución falla.
- *Añadido tras la implementación inicial:* una carpeta `Estado` también dentro de n8n (proyecto Personal) con ese workflow dentro, espejo de `workflows/estado/`. En Community Edition las carpetas requieren registrar la instancia con una clave de licencia gratuita enviada por email; se registra con el email del owner.

**No entra:**
- Una base o un usuario separado para datos de la app: se reutiliza la base `n8n` y el único usuario de SPEC 01.
- Crear la cuenta owner de n8n: ya existe; el login se da en el momento de implementar y no se guarda en el repo.
- Workflows con triggers automáticos (cron, webhook) o lógica de negocio. El workflow de estado se ejecuta a mano; exponerlo como endpoint de salud (webhook) o programarlo irá en otra spec.
- Renombrar nada existente en inglés (nombres propios de n8n como *Manual Trigger*, tipos de nodo o claves del JSON exportado): la regla de `CLAUDE.md` aplica a lo que se crea con nombre propio.
- Guardar la contraseña de Postgres en pgAdmin vía `PassFile`: pgAdmin la pide la primera vez.
- Exponer puertos fuera de `127.0.0.1` o TLS.
- Cambiar los secretos del `.env`.

## Modelo de datos

**Postgres (base `n8n`):**

```sql
CREATE SCHEMA IF NOT EXISTS pruebas;
CREATE TABLE IF NOT EXISTS pruebas.prueba_n8n (
  id         serial PRIMARY KEY,
  mensaje    text        NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
```

**Credencial n8n:**

| Campo | Valor |
|---|---|
| Nombre | `Postgres n8n (local)` |
| Tipo | Postgres |
| Host | `postgres` |
| Database | `n8n` (de `POSTGRES_DB`) |
| User | valor de `POSTGRES_USER` |
| Password | valor de `POSTGRES_PASSWORD` |
| Port | `5432` |
| SSL | `disable` |

**Workflow `Prueba Postgres`** (nodos en orden):
1. `Ejecutar prueba` — Manual Trigger.
2. `Crear tabla` — Postgres, *Execute Query*: el SQL de arriba.
3. `Insertar fila` — Postgres, *Execute Query*: `INSERT INTO pruebas.prueba_n8n (mensaje) VALUES ('hola desde n8n') RETURNING *;`
4. `Leer filas` — Postgres, *Execute Query*: `SELECT * FROM pruebas.prueba_n8n ORDER BY id DESC LIMIT 10;`

**Workflow `Estado base de datos`** (`workflows/estado/estado-base-de-datos.json`, id `estadoBaseDatos01`, misma credencial):
1. `Ejecutar estado` — Manual Trigger.
2. `Consultar salud` — Postgres, *Execute Query*: `SELECT now() AS ahora, current_database() AS base_de_datos, current_user AS usuario_conectado, version() AS version_postgres, pg_is_in_recovery() AS en_recuperacion;`
3. `Armar resultado` — Set: `estado = "sano"` más los campos en español del paso 2 (`ahora`, `base_de_datos`, `usuario_conectado`, `version_postgres`).

**Regla en `CLAUDE.md`** (raíz del repo): los nombres de workflows, nodos, carpetas de workflows y las variables (campos, alias SQL, variables de `.env` nuevas) se escriben en español, sin acentos ni espacios en identificadores (`snake_case`).

**`pgadmin/servers.json`** (gitignored, porque incluye el usuario generado):

```json
{
  "Servers": {
    "1": {
      "Name": "Postgres n8n (local)",
      "Group": "Servers",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "n8n",
      "Username": "<POSTGRES_USER>",
      "SSLMode": "disable"
    }
  }
}
```

## Plan de implementación

1. **Pre-registrar el servidor en pgAdmin.**
   - Generar `pgadmin/servers.json` desde `.env` (sin imprimir secretos) y añadir `pgadmin/` al `.gitignore`.
   - En `docker-compose.yml`, servicio `pgadmin`: montar `./pgadmin/servers.json:/pgadmin4/servers.json:ro`.
   - pgAdmin solo importa `servers.json` cuando su base de configuración está vacía: recrear el volumen `pgadmin_data` (`docker compose rm -sf pgadmin && docker volume rm medical-school_pgadmin_data && docker compose up -d pgadmin`). Solo se pierde configuración de pgAdmin.
2. **Intentar conectar el MCP de n8n (plan A).** En n8n, *Settings → MCP Access*: activar el acceso MCP de la instancia y copiar la URL (`…/mcp-server/http`) y el token. Corregir la entrada `n8n` de la config MCP de Claude Code (hoy apunta a `http://localhost:5678` y falla con `ENDPOINT_NOT_FOUND`) y reiniciar la sesión. Si después de esto el MCP no conecta, pasar al plan B (Playwright) en los pasos 3 y 4.
3. **Crear la credencial `Postgres n8n (local)`.** Con MCP si expone creación de credenciales; si no, con Playwright en la UI (login con el owner existente → *Credentials → Add → Postgres*) y los valores de la tabla. Pulsar *Test connection*: debe decir que la conexión es correcta.
4. **Crear el workflow `Prueba Postgres`** con los 4 nodos, todos usando la credencial del paso 3. Con MCP (crear desde código) o, si no, con Playwright en el editor. Guardarlo.
5. **Ejecutar el workflow** (*Execute workflow*) y comprobar que `Leer filas` devuelve al menos una fila con `mensaje = 'hola desde n8n'`.
6. **Exportar el workflow** a `workflows/prueba-postgres.json` (por MCP/UI o con `docker compose exec n8n n8n export:workflow --id=<id>`). Revisar que el JSON solo referencia la credencial por id/nombre y no contiene la contraseña.
7. **Verificar desde pgAdmin** (ver criterios) y hacer commit de `docker-compose.yml`, `.gitignore` y `workflows/prueba-postgres.json`.
8. **Crear `CLAUDE.md`** en la raíz con la regla de workflows y variables en español.
9. **Crear el workflow `Estado base de datos`** en `workflows/estado/estado-base-de-datos.json`, importarlo con el CLI de n8n, ejecutarlo y re-exportarlo desde n8n sin secretos ni datos del owner.

## Criterios de aceptación

- [ ] `pgadmin/servers.json` existe, no está trackeado por git y `git check-ignore pgadmin/servers.json` lo confirma.
- [ ] `docker-compose.yml` monta `./pgadmin/servers.json` en `/pgadmin4/servers.json` en modo solo lectura.
- [ ] Al abrir `http://127.0.0.1:5050`, el árbol muestra `Postgres n8n (local)` sin registrarlo a mano; tras introducir la contraseña conecta y en *Query Tool* `SELECT * FROM pruebas.prueba_n8n;` devuelve filas.
- [ ] En n8n existe la credencial `Postgres n8n (local)` y su *Test connection* es correcto.
- [ ] En n8n existe el workflow `Prueba Postgres` con los nodos `Ejecutar prueba`, `Crear tabla`, `Insertar fila`, `Leer filas`.
- [ ] Ejecutarlo dos veces termina sin errores y la segunda vez `Leer filas` devuelve al menos 2 filas (`CREATE … IF NOT EXISTS` es idempotente).
- [ ] `docker compose exec postgres psql -U "$POSTGRES_USER" -d n8n -c 'select count(*) from pruebas.prueba_n8n'` devuelve ≥ 1.
- [ ] Las tablas internas de n8n en `public` no se modificaron (el workflow solo toca el esquema `pruebas`).
- [ ] `workflows/prueba-postgres.json` existe, es JSON válido y `grep -c "$POSTGRES_PASSWORD" workflows/prueba-postgres.json` devuelve 0.
- [ ] Se documenta en el cierre si se usó el MCP de n8n o Playwright, y por qué.
- [ ] `CLAUDE.md` existe en la raíz y contiene la regla de workflows y variables en español.
- [ ] En n8n existe el workflow `Estado base de datos` con los nodos `Ejecutar estado`, `Consultar salud`, `Armar resultado`, y al ejecutarlo termina con `success` y `Armar resultado` devuelve `estado = "sano"`.
- [ ] `workflows/estado/estado-base-de-datos.json` existe, es JSON válido, y no contiene la contraseña ni el usuario de Postgres ni el email del owner.
- [ ] Todos los nombres y campos del workflow de estado están en español.
- [ ] La instancia de n8n tiene la licencia gratuita activada (*Settings → Usage and plan* ya no pide activar) y en el proyecto Personal existe la carpeta `Estado` con `Estado base de datos` dentro.

## Decisiones tomadas y descartadas

- **Tomada: reutilizar la base `n8n` y el usuario de SPEC 01.** Es lo que pidió el usuario y basta para una prueba local. **Descartada:** base y usuario propios para la app (queda para otra spec).
- **Tomada: esquema `pruebas`** para la tabla de prueba. Aísla los datos de las tablas internas de n8n en `public` y se limpia con `DROP SCHEMA pruebas CASCADE`. **Descartada:** `public.prueba_n8n`.
- **Tomada: MCP de n8n primero, Playwright como respaldo.** El MCP fue lo pedido; hoy falla porque la URL configurada no es el endpoint MCP. Si el MCP no permite crear credenciales, esa parte se hace con Playwright aunque el workflow vaya por MCP.
- **Tomada: host `postgres` en la credencial**, porque n8n habla con Postgres por la red interna de compose. **Descartada:** `localhost`/`127.0.0.1`, que dentro del contenedor apunta al propio n8n.
- **Tomada: pgAdmin preconfigurado con `servers.json` gitignored.** El archivo lleva el usuario generado, que la SPEC 01 trata como no adivinable. **Descartada:** registrar el servidor a mano o versionar el archivo.
- **Tomada: recrear `pgadmin_data`** para que se importe `servers.json`. Solo contiene configuración de pgAdmin. **Descartada:** `setup.py load-servers` dentro del contenedor, que en modo escritorio depende del usuario interno de pgAdmin y es más frágil.
- **Tomada: sin `PassFile`.** pgAdmin pide la contraseña la primera vez y puede guardarla en su volumen. Evita otro archivo con secretos.
- **Tomada: exportar el workflow a `workflows/prueba-postgres.json`.** Queda versionado; n8n guarda solo la referencia a la credencial.
- **Tomada: ampliar esta spec** con la regla de español y el workflow de estado, a petición del usuario, en vez de abrir una spec 03. **Descartada:** spec aparte, que habría dado su propia rama y criterios.
- **Tomada: la regla va en el `CLAUDE.md` del proyecto** (versionado, aplica a este repo). **Descartada:** `~/.claude/CLAUDE.md` global.
- **Tomada: carpeta `Estado` tanto en `workflows/estado/` (repo) como en la UI de n8n**, a petición del usuario. Para la de n8n se registra la instancia con la licencia gratuita de Community Edition, que envía el email del owner a n8n. **Descartada:** dejar la carpeta solo en el repo.
- **Tomada: workflow de estado manual y con fallo explícito.** Si Postgres no responde, la ejecución falla; no se captura el error, así el fallo se ve en *Executions*. **Descartada:** webhook o cron, que quedan para otra spec.

## Riesgos identificados

- **Credenciales de Postgres visibles en la sesión del agente:** con Playwright, usuario y contraseña se escriben en la UI y pueden quedar en el transcript o en capturas. Mitigación: leerlos del `.env` en el último momento, no hacer capturas del formulario y no imprimirlos.
- **El workflow escribe en la base de n8n:** un SQL mal escrito podría afectar tablas internas. Mitigación: todas las consultas cualifican `pruebas.`; para limpiar, `DROP SCHEMA pruebas CASCADE`.
- **Cambiar `N8N_ENCRYPTION_KEY` o `POSTGRES_PASSWORD` en el futuro** deja la credencial de n8n inválida y hay que recrearla.
- **`servers.json` no se reimporta** si `pgadmin_data` ya tiene datos: cualquier cambio posterior exige recrear el volumen otra vez.
- **El MCP de n8n puede no estar disponible en la versión 2.46.6 o no exponer credenciales:** se cubre con Playwright.
