# SPEC 05 — Verificación de correo y recuperación de contraseña con código por SMTP (Mailpit)

**Estado:** Aprobado
**Depende de:** SPEC 04 (y, a través de ella, SPEC 01, 02 y 03)
**Fecha:** 2026-11-09
**Objetivo:** Añadir a la API de autenticación la verificación de correo obligatoria y la recuperación de contraseña, ambas con un código de 6 dígitos enviado por SMTP (Mailpit en local, configurable a un SMTP real) y gestionadas por workflows de n8n sobre Supabase Auth.

## Alcance

**Entra:**
- Servicio `mailpit` (`axllent/mailpit:v1.33.1`) en el compose: buzón de pruebas con interfaz y API en `127.0.0.1:8025`. Su SMTP (puerto 1025) solo se alcanza por la red interna de compose. No envía nada a internet.
- Supabase Auth apuntando a ese SMTP con las variables `SMTP_*` del `.env` (listas para cambiarlas a un SMTP real), código de 6 dígitos con caducidad de **15 minutos** (`GOTRUE_MAILER_OTP_EXP=900`) y aviso de cambio de contraseña activado.
- Plantillas de correo en español en `auth/plantillas/` (`verificacion.html`, `recuperacion.html`, `cambio_contrasena.html`), servidas por Caddy en un puerto interno `:8081` (no publicado) y referenciadas por Supabase Auth con sus variables `GOTRUE_MAILER_TEMPLATES_*` y `GOTRUE_MAILER_SUBJECTS_*`. Solo llevan el código, sin enlaces.
- Cuatro endpoints nuevos, cada uno un workflow de n8n en la carpeta `Autenticacion`:
  - `POST /autenticacion/verificar-correo` `{ correo, codigo }` → `200 { mensaje }`. Solo confirma el correo; no abre sesión.
  - `POST /autenticacion/reenviar-verificacion` `{ correo }` → `202 { mensaje }`, igual exista o no el correo.
  - `POST /autenticacion/recuperar` `{ correo }` → `202 { mensaje }`, igual exista o no el correo.
  - `POST /autenticacion/restablecer` `{ correo, codigo, contrasena_nueva }` → `200 { mensaje }`. Aplica la política estricta de contraseña, revoca **todas** las sesiones del usuario y dispara el aviso por correo.
- Cambios a lo existente: autoconfirmación apagada (`ENABLE_EMAIL_AUTOCONFIRM=false`), `registro` pide verificar el correo, `iniciar-sesion` responde `403 CORREO_NO_VERIFICADO` a una cuenta sin verificar con la contraseña correcta, y Caddy, `pruebas.sh`, `auth/README.md` y la colección de Postman cubren los endpoints nuevos.
- Límites propios en una tabla nueva del esquema `autenticacion`: 3 solicitudes de código por correo y propósito y 10 por IP cada hora; 5 códigos erróneos por correo y propósito y 20 por IP cada 15 minutos.
- `recuperar` y `reenviar-verificacion` responden antes de llamar a Supabase Auth, para que el tiempo de respuesta no dependa de si el correo existe.

**No entra:**
- Login con Google, Apple y Facebook (SPEC 06).
- Un SMTP real de producción (dominio, SPF, DKIM): solo queda configurable por variables.
- Cambiar la contraseña o el correo estando con la sesión iniciada, enlaces mágicos, códigos para iniciar sesión, 2FA.
- Plantillas HTML con marca, cola de reintentos o bandeja de salida.
- Cerrar el acceso directo a Supabase Auth por Kong (`/auth/v1/*`, riesgo ya anotado en SPEC 04), que también permite `recover`, `verify` y `resend` sin pasar por n8n.
- Persistir los correos de Mailpit entre reinicios.

## Modelo de datos

**Usuarios y códigos:** viven en Supabase Auth (`auth.users` guarda `email_confirmed_at`, `confirmation_sent_at`, `recovery_sent_at` y los tokens con hash); no se crean tablas para ellos. Las cuentas ya existentes siguen confirmadas.

**Base `n8n`, esquema `autenticacion`** (`auth/sql/002_codigos.sql`, se aplica con el rol de n8n; idempotente):

```sql
CREATE TABLE IF NOT EXISTS autenticacion.eventos_codigo (
  id         bigserial   PRIMARY KEY,
  proposito  text        NOT NULL CHECK (proposito IN ('verificacion', 'recuperacion')),
  tipo       text        NOT NULL CHECK (tipo IN ('solicitud', 'error')),
  correo     text        NOT NULL,  -- en minúsculas
  ip         inet        NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_codigo_correo_idx ON autenticacion.eventos_codigo (correo, proposito, tipo, creado_en DESC);
CREATE INDEX IF NOT EXISTS eventos_codigo_ip_idx     ON autenticacion.eventos_codigo (ip, tipo, creado_en DESC);
```

**Reglas de los límites** (ventanas deslizantes, contadas por el texto del correo aunque la cuenta no exista, para no revelar qué correos existen; los intentos rechazados por límite no se registran; cada petición borra de paso las filas de más de 1 día):

| Límite | Condición para bloquear | Respuesta |
|---|---|---|
| Solicitudes por correo | 3 `solicitud` del mismo correo y propósito en 1 h | `429 DEMASIADOS_INTENTOS` + `Retry-After` |
| Solicitudes por IP | 10 `solicitud` de la IP en 1 h (ambos propósitos) | `429 DEMASIADOS_INTENTOS` + `Retry-After` |
| Códigos erróneos por correo | 5 `error` del mismo correo y propósito en 15 min | `429 CODIGO_BLOQUEADO` + `Retry-After` (rechaza también el código correcto) |
| Códigos erróneos por IP | 20 `error` de la IP en 15 min | `429 DEMASIADOS_INTENTOS` + `Retry-After` |

**Endpoints** (mismo formato de error y mismas reglas de campos que SPEC 04; `codigo` es un texto de exactamente 6 dígitos y `contrasena_nueva` sigue la política estricta de SPEC 04, incluida `no_contiene_correo`):

| Método y ruta | Entrada | Salida correcta |
|---|---|---|
| `POST /autenticacion/verificar-correo` | `{ correo, codigo }` | `200 { mensaje: "Correo verificado. Ya puedes iniciar sesión." }` |
| `POST /autenticacion/reenviar-verificacion` | `{ correo }` | `202 { mensaje: "Si el correo está registrado y sin verificar, te enviamos un código." }` |
| `POST /autenticacion/recuperar` | `{ correo }` | `202 { mensaje: "Si el correo está registrado, te enviamos un código." }` |
| `POST /autenticacion/restablecer` | `{ correo, codigo, contrasena_nueva }` | `200 { mensaje: "Contraseña actualizada. Inicia sesión con la nueva." }` |

**Errores nuevos:**

| Código | HTTP | Cuándo |
|---|---|---|
| `CODIGO_INVALIDO` | 400 | código erróneo, vencido, ya usado o de un correo inexistente (mismo cuerpo siempre) |
| `CODIGO_BLOQUEADO` | 429 | 5 códigos erróneos del correo en 15 min; incluye `reintentar_en_segundos` |
| `CORREO_NO_VERIFICADO` | 403 | contraseña correcta en una cuenta sin verificar (no cuenta como intento fallido) |

`registro` pasa a responder `201 { mensaje: "Cuenta creada. Revisa tu correo y verifícala con el código que te enviamos." }`, igual exista o no el correo.

**Variables del `.env`:** `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` y `SMTP_SENDER_NAME` (nombres impuestos por Supabase). Con Mailpit, `SMTP_USER` y `SMTP_PASS` van **vacíos**: Supabase Auth se niega a mandar credenciales por una conexión sin cifrar (`unencrypted connection`); se rellenan al pasar a un SMTP real con TLS, `ENABLE_EMAIL_AUTOCONFIRM=false`. En el servicio `auth` de `supabase/docker-compose.yml`: `GOTRUE_MAILER_OTP_EXP=900`, `GOTRUE_MAILER_TEMPLATES_CONFIRMATION`, `GOTRUE_MAILER_TEMPLATES_RECOVERY`, `GOTRUE_MAILER_TEMPLATES_PASSWORD_CHANGED_NOTIFICATION`, los `GOTRUE_MAILER_SUBJECTS_*` correspondientes y `GOTRUE_MAILER_NOTIFICATIONS_PASSWORD_CHANGED_ENABLED=true`.

## Plan de implementación

1. **Mailpit y SMTP.** Añadir el servicio `mailpit` al compose (UI y API solo en `127.0.0.1:8025`), poner `SMTP_*` en el `.env` y en `.env.example`, y `GOTRUE_MAILER_OTP_EXP=900` en el servicio `auth`. La autoconfirmación sigue activa. Comprobar el cableado haciendo que Supabase Auth envíe un correo de recuperación a un usuario de prueba y viéndolo llegar a Mailpit. Confirmar en esta versión que las variables `GOTRUE_*` de este spec existen.
2. **Plantillas en español.** Crear `auth/plantillas/*.html`, añadir a Caddy un sitio interno `:8081` que las sirve (montadas en solo lectura) y configurar las variables `GOTRUE_MAILER_TEMPLATES_*` y `GOTRUE_MAILER_SUBJECTS_*`. Comprobar que el correo de recuperación llega en español, con un código de 6 dígitos y sin enlaces.
3. **Tabla de límites.** Crear y aplicar `auth/sql/002_codigos.sql`.
4. **Workflow `Recuperar contrasena`.** Validación del correo, comprobación de límites, respuesta `202` inmediata y después `auth:9999/recover`. Añadir la ruta a Caddy (método, tipo de contenido) y los casos a `pruebas.sh`, que leen el código desde la API de Mailpit.
5. **Workflow `Restablecer contrasena`.** Validación de campos y de la política antes de gastar el código, límites de errores, `auth:9999/verify` (tipo `recovery`), `PUT /user` con la contraseña nueva y `logout?scope=global` para revocar todas las sesiones. Ruta en Caddy y casos en `pruebas.sh`.
6. **Verificación de correo.** Poner `ENABLE_EMAIL_AUTOCONFIRM=false`; crear los workflows `Verificar correo` (`/verify`, tipo `signup`, descartando la sesión que Supabase devuelve) y `Reenviar verificacion` (`/resend`); cambiar `Registro de usuario` (mensaje nuevo) e `Inicio de sesion` (`403 CORREO_NO_VERIFICADO`); rutas en Caddy; ajustar `pruebas.sh` para que cada usuario de prueba se verifique con el código de Mailpit y añadir los casos nuevos.
7. **Contrato y verificación final.** Actualizar `auth/README.md` y la colección de Postman con los cuatro endpoints y los cambios del registro y el login, ejecutar `pruebas.sh` completo y repasar los criterios.

## Criterios de aceptación

- [ ] `auth/pruebas/pruebas.sh` termina con código 0 contra el stack levantado y cubre cada criterio de esta lista que lo permite, incluidos los de SPEC 04.
- [ ] `docker compose config -q` pasa; `mailpit` está en ejecución con su interfaz y API solo en `127.0.0.1:8025`, y ni el SMTP de Mailpit (1025) ni el puerto interno `:8081` de Caddy están publicados en el host.
- [ ] En el servicio `auth`, `SMTP_HOST` es `mailpit`, `GOTRUE_MAILER_OTP_EXP` es `900` y `ENABLE_EMAIL_AUTOCONFIRM` es `false`.
- [ ] Las tres plantillas se sirven por la red interna (`wget http://caddy:8081/recuperacion.html` desde el contenedor `n8n` devuelve HTML) y no por el host (`127.0.0.1:8081` rechaza la conexión).
- [ ] Tras `recuperar` de una cuenta verificada, Mailpit recibe un solo correo para ese destinatario, con asunto en español y un código de 6 dígitos en el cuerpo, sin ningún enlace.
- [ ] `recuperar` de un correo registrado y de uno inexistente devuelven el mismo estado `202` y el mismo cuerpo, y Mailpit solo recibe correo en el primer caso.
- [ ] La cuarta solicitud de código del mismo correo y propósito en 1 h devuelve `429 DEMASIADOS_INTENTOS` con `Retry-After`, también para un correo inexistente; la undécima desde la misma IP también.
- [ ] `restablecer` con el código correcto y una contraseña válida devuelve `200`; después, iniciar sesión con la contraseña nueva funciona (`200`) y con la vieja da `401`.
- [ ] Tras `restablecer`, la cookie de renovación y el token de acceso de una sesión abierta antes dejan de servir (`renovar` y `yo` devuelven `401`).
- [ ] Tras `restablecer`, Mailpit recibe un correo de aviso de cambio de contraseña para ese usuario.
- [ ] Reusar el mismo código en `restablecer` devuelve `400 CODIGO_INVALIDO`, y un código vencido (con `recovery_sent_at` retrasado 16 minutos en `auth.users`) también.
- [ ] `restablecer` con una contraseña que incumple la política devuelve `422 CONTRASENA_INSEGURA` y el código sigue siendo válido: se puede usar después con una contraseña correcta.
- [ ] `restablecer` con un código erróneo y con un correo inexistente devuelven `400 CODIGO_INVALIDO` con cuerpos idénticos byte a byte.
- [ ] Tras 5 códigos erróneos del mismo correo, el sexto intento (aun con el código correcto) devuelve `429 CODIGO_BLOQUEADO` con `Retry-After` mayor que 0; con 20 códigos erróneos desde la misma IP, el siguiente devuelve `429 DEMASIADOS_INTENTOS`.
- [ ] `registro` de un correo nuevo devuelve `201` con el mensaje nuevo, deja `email_confirmed_at` nulo en `auth.users` y Mailpit recibe un correo con un código de 6 dígitos; registrar dos veces el mismo correo devuelve el mismo cuerpo.
- [ ] `iniciar-sesion` con la contraseña correcta en una cuenta sin verificar devuelve `403 CORREO_NO_VERIFICADO`; con una contraseña incorrecta devuelve el mismo `401 CREDENCIALES_INVALIDAS` de siempre, y el `403` no suma a `intentos_inicio_sesion`.
- [ ] `verificar-correo` con el código correcto devuelve `200`, deja `email_confirmed_at` con fecha, no devuelve tokens ni cookie, y a partir de ahí `iniciar-sesion` da `200`; con un código erróneo devuelve `400 CODIGO_INVALIDO`.
- [ ] `reenviar-verificacion` de una cuenta sin verificar devuelve `202` y Mailpit recibe un código nuevo; de una cuenta ya verificada y de un correo inexistente devuelve el mismo `202` y no llega correo.
- [ ] Las rutas nuevas responden por Caddy `405` ante un método distinto de `POST`, `415` ante un `Content-Type` distinto de `application/json`, `413` ante más de 10 KB, y por el puerto 5678 directo sin el secreto del proxy responden `403`.
- [ ] Un código o una contraseña mal formados, un campo faltante o un campo extra en los cuatro endpoints devuelven `422 VALIDACION_FALLIDA`.
- [ ] En la base `n8n`, 2 minutos después de ejecutar `pruebas.sh`, ni `execution_entity` ni `execution_data` tienen filas de los nueve workflows de autenticación, y ningún código ni contraseña de las pruebas aparece en `execution_data`.
- [ ] En n8n existen los cuatro workflows nuevos, publicados y dentro de la carpeta `Autenticacion`, y los nombres de workflows, nodos, campos, tablas y variables nuevas están en español (excepto las variables que impone Supabase).
- [ ] Ningún archivo de `auth/` ni `.env.example` contiene secretos (`SMTP_PASS`, `SECRETO_PROXY`, `JWT_SECRET`) ni el email del owner, y `auth/plantillas/` no contiene enlaces.
- [ ] `auth/README.md` documenta los nueve endpoints, los errores nuevos, la caducidad de 15 minutos y cómo cambiar a un SMTP real; la colección de Postman tiene nueve peticiones en la carpeta `Autenticacion`, nombradas como sus workflows, y sigue siendo JSON válido sin secretos.

## Decisiones tomadas y descartadas

- **Tomada: incluir la verificación de correo en esta spec**, a petición del usuario, aunque se recomendó separarla. Cierra el riesgo de la autoconfirmación de SPEC 04, a costa de una spec con siete pasos y cuatro flujos. **Descartada:** dejar la verificación para una spec aparte.
- **Tomada: código de 6 dígitos y no enlace.** No exige una página del front (aún no hay framework), no hay enlaces que un antivirus o el cliente de correo "abran" solos, y todas las rutas quedan en la API. **Descartada:** enlace a `ORIGEN_FRONT/restablecer?token=…`.
- **Tomada: Mailpit local con variables `SMTP_*` configurables.** Permite probar sin credenciales y que las pruebas lean el código por su API. **Descartada:** SMTP real ahora.
- **Tomada: ninguna ruta de código entrega tokens.** `verificar-correo` solo confirma y `restablecer` solo cambia la contraseña; el usuario inicia sesión después. Adivinar o interceptar un código no da una sesión. **Descartada:** abrir sesión al verificar. Supabase sí crea una sesión en `/verify`; n8n la descarta y la revoca.
- **Tomada: `403 CORREO_NO_VERIFICADO` solo con la contraseña correcta.** Supabase comprueba la contraseña antes que la verificación, así que no filtra qué correos existen. Los intentos con contraseña incorrecta siguen devolviendo el `401` genérico y contando para el bloqueo. **Descartada:** `401` genérico, que deja al usuario sin saber por qué no puede entrar.
- **Tomada: caducidad de 15 minutos para ambos códigos**, el único valor `OTP_EXP` que admite Supabase Auth. **Descartada:** 1 hora.
- **Tomada: validar la política de contraseña antes de llamar a `/verify`**, para que un error de contraseña no gaste el código.
- **Tomada: `restablecer` revoca todas las sesiones** (`logout?scope=global`) y avisa por correo. **Descartadas:** dejar las sesiones abiertas y no avisar.
- **Tomada: tabla propia `eventos_codigo` con límites propios**, separada de `intentos_inicio_sesion`. Sus ventanas y propósitos son otros. **Descartada:** depender solo del límite interno de Supabase Auth (1 correo por minuto por usuario), que no frena el spam a una IP ni la adivinanza desde varias cuentas.
- **Tomada: responder `202` antes de llamar a Supabase Auth** en `recuperar` y `reenviar-verificacion`, para que el tiempo de respuesta no distinga si el correo existe. **Descartada:** esperar al resultado de Supabase.
- **Tomada: plantillas servidas por Caddy en un puerto interno.** Supabase Auth carga las plantillas por URL, y Caddy ya está en el compose. **Descartada:** otro contenedor solo para servir tres archivos.
- **Tomada: mismos cuerpos y estados para correos existentes e inexistentes** en `registro`, `recuperar`, `reenviar-verificacion` y `restablecer`, igual que en SPEC 04.

## Riesgos identificados

- **Mailpit expone los códigos a cualquiera que llegue a `127.0.0.1:8025`:** sirve para desarrollo y pruebas. En producción hay que apuntar `SMTP_*` a un SMTP real y quitar el servicio y su puerto.
- **Kong sigue exponiendo `/auth/v1/recover`, `/verify`, `/resend` y `/signup`** con solo la clave `anon` (riesgo ya anotado en SPEC 04). Quien llame ahí se salta los límites propios y la política de contraseña; solo le frenan los límites internos de Supabase Auth.
- **Un código de 6 dígitos tiene 1 000 000 de combinaciones:** se mitiga con 5 errores por correo en 15 minutos, 20 por IP y la caducidad de 15 minutos, pero un atacante con muchas IPs y un correo objetivo sigue teniendo una probabilidad pequeña por ventana.
- **La contraseña nueva y los códigos pasan por n8n** como cuerpo de la petición: valen las mismas medidas y la misma ventana de 1 o 2 minutos de SPEC 04 (workflows sin guardar ejecuciones y borrado rápido).
- **Fallos del SMTP pasan desapercibidos:** como `recuperar` y `reenviar-verificacion` responden antes de enviar, si Mailpit o el SMTP real caen el usuario recibe `202` y nunca le llega el correo. Habrá que mirar los registros de `auth` y de n8n.
- **Los correos de Mailpit se pierden al reiniciarlo**, y las pruebas dependen de que su API esté disponible.
- **Las variables `GOTRUE_MAILER_*` pueden llamarse distinto en `gotrue:v2.189.0`:** el paso 1 las confirma antes de seguir; si alguna no existe, se ajusta la spec.
- **Cuentas creadas por la API de Supabase (Kong) mientras la autoconfirmación esté apagada** quedan sin verificar hasta que usen un código; ninguna cuenta anterior se ve afectada.
- **La ejecución de `verify` crea una sesión** que n8n debe revocar; si el paso falla, quedan sesiones huérfanas de corta vida (el token de acceso dura 15 minutos).
