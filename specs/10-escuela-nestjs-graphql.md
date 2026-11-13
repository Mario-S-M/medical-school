# SPEC 10 — Escuela en NestJS: roles, cursos, catálogo, revisión, equipo, portadas y videos con GraphQL y REST

**Estado:** Implementado
**Depende de:** SPEC 09 (y, a través de ella, SPEC 08, 07, 06, 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-12
**Objetivo:** Reemplazar los workflows de n8n de la escuela (SPEC 07 y 08) por módulos de NestJS sobre la base `plataforma`, con el dominio en GraphQL protegido y los bordes (firmas de subida y webhook del transcodificador) en REST, copiando los datos existentes sin cambiar lo que ve el usuario.

## Por qué existe esta spec

El usuario pidió pasar todo de n8n a NestJS y borrar n8n al final. La SPEC 09 dejó la base (`api/`, `plataforma`, autenticación, GraphQL protegido, inglés y módulos) y un proxy temporal que manda `/escuela/*` a n8n. Esta spec migra **toda** la escuela; la SPEC 11 solo borra n8n.

**Cambio respecto a la división que anunciaba la SPEC 09** (10 = escuela sin videos, 11 = videos y borrado de n8n): los videos no se pueden migrar aparte. `videos_clase` apunta con clave foránea a `clases`, que viven en la base `n8n`, y los workflows de video comprueban el acceso en esa misma base. Con la escuela en `plataforma` y los videos en n8n, cualquier curso nuevo no podría subir video. Por eso aquí entra todo, y la 11 queda para el borrado.

**Regla heredada de la SPEC 09:** el dominio va en **GraphQL**; los bordes van en **REST** (autenticación, firmas de subida a Storage y webhooks internos).

**Cómo se hace sin romper la aplicación:** los módulos nuevos se construyen y prueban contra `plataforma` con una copia de los datos mientras n8n sigue sirviendo la escuela. El **corte** es un solo paso (el 10): se vuelven a copiar los datos, el front y el transcodificador pasan a la API y se quita el proxy `/escuela/*`. Hasta ese paso nada visible cambia.

## Alcance

**Entra:**

- **Esquema `escuela` en `plataforma`** por migraciones de TypeORM, con las mismas tablas, índices, restricciones y la función `escuela.sin_acentos` de las SPEC 07 y 08: `roles_usuario`, `perfiles_instructor`, `categorias`, `cursos` (con `busqueda` generada), `secciones`, `clases`, `equipos_apoyo`, `invitaciones_equipo`, `videos_clase` y `claves_video`. La extensión `unaccent` se crea como superusuario en `plataforma.sql` y en `create-platform-database.sh`.
- **Copia de datos** de `n8n.escuela` a `plataforma.escuela` con `api/scripts/copy-school-data.sh`: conserva los ids, ajusta las secuencias y se puede repetir (vacía y vuelve a copiar). Se ejecuta de nuevo en el corte.
- **Módulos de NestJS** en `api/src/modules/`: `roles`, `categories`, `courses`, `syllabus`, `catalog`, `review`, `team`, `covers`, `videos`, `users-admin` y `mail`. Cada uno con sus entidades de TypeORM, servicios, DTO, resolvers y guardias.
- **Permisos por base de datos**: el decorador `@Roles` de la SPEC 09 deja de leer el claim del token y consulta `escuela.roles_usuario`; las reglas de propiedad del curso y de equipo de apoyo de la SPEC 07 viven en una política reutilizable (`CourseAccessPolicy`), no copiada en cada resolver.
- **GraphQL** (`POST /api/graphql`, todas las operaciones en el manifiesto de consultas persistidas; campos en español y `snake_case`, igual que el contrato actual):
  - **Consultas:** `categorias`, `cursos(q, categoria, nivel, pagina)`, `curso(slug)` (las tres públicas, sin token), `mis_roles`, `mis_invitaciones`, `mis_cursos`, `curso_edicion(id)`, `mi_equipo`, `estado_video(clase_id)`, `buscar_usuario(correo)` (admin) y `cursos_en_revision` (admin).
  - **Mutaciones:** `responder_invitacion`, `crear_curso`, `editar_curso`, `guardar_seccion`, `borrar_seccion`, `guardar_clase`, `borrar_clase`, `mover`, `enviar_revision`, `confirmar_portada`, `invitar_equipo`, `cancelar_invitacion`, `quitar_miembro`, `confirmar_subida_video`, `reintentar_video`, `borrar_video`, `asignar_rol`, `guardar_categoria`, `borrar_categoria`, `resolver_revision` y `retirar_curso`.
  - Mismas entradas, salidas, reglas y permisos que los endpoints de las SPEC 07 y 08. Las que respondían `204` devuelven `{ ok: true }`.
- **REST (bordes)** bajo `/api/v1`:

  | Método y ruta | Quién | Entrada → salida |
  |---|---|---|
  | `POST /api/v1/portadas/firmas` | dueño | `{ curso_id, tipo_contenido, tamano_bytes }` → `201 { url_subida, ruta }` |
  | `POST /api/v1/videos/firmas` | dueño, equipo | `{ clase_id, nombre_archivo, tipo_contenido, tamano_bytes }` → `201 { video_id, url_subida, ruta }` |
  | `POST /api/v1/interno/video-procesado` | transcodificador | `{ video_id, resultado, duracion_segundos?, mensaje? }` → `200`; exige `X-Secreto-Transcodificador`, si no `403` |

- **Cambios de contrato respecto a n8n** (únicos, y deliberados): las lecturas y mutaciones pasan de `GET/POST /escuela/*` a GraphQL; las firmas de portada y de video a las rutas REST de arriba; el webhook del transcodificador a `/api/v1/interno/video-procesado`. Los cuerpos, los campos, los códigos de error y las reglas de negocio no cambian. Los errores de GraphQL llevan `extensions.codigo` con el mismo código de siempre (`SIN_PERMISO`, `CURSO_EN_REVISION`, `CURSO_INCOMPLETO` con `detalles`, `VIDEO_INVALIDO`…).
- **Protecciones de GraphQL** de la SPEC 09 intactas, más: el costo de una consulta cuenta las listas con multiplicador (el tamaño de página, 12, y el tamaño máximo de las listas), y las consultas públicas del catálogo se aceptan sin token pero con el mismo límite de peticiones. El `@Roles` y la guardia JWT siguen exigiendo sesión en todo lo demás.
- **Correo de invitación** con `nodemailer` por SMTP (`SMTP_HOST` y `SMTP_PORT` del compose; Mailpit en local), plantilla `api/templates/team-invitation.html` (la misma de `escuela/plantillas/`, sin enlaces y en español).
- **Supabase Storage y Auth admin** con la clave de servicio (`SERVICE_ROLE_KEY`, ya presente en el entorno de la API): buckets `portadas` (público) y `videos` (privado), firma de subida, comprobación de objetos, borrado por prefijo y búsqueda de cuentas por correo. Los scripts de buckets pasan a `api/scripts/`.
- **Videos:** clave AES-128 generada con `crypto.randomBytes(16)` (en NestJS sí hay `crypto`), una sola copia en `claves_video` y nunca en una respuesta; reglas de estado, un solo vigente y uno en proceso (índices únicos parciales), tiempo máximo de 45 minutos al consultar el estado, borrado de archivos al borrar clase, sección o video, y `falta_video` al enviar a revisión. El transcodificador llama a la API en lugar de a n8n (`URL_CALLBACK`) y a la API se le pide el trabajo con la misma cabecera secreta.
- **Front:** la capa `src/features/*/api/` pasa de `/escuela/*` a operaciones de GraphQL (axios con el hash persistido y TanStack Query) y a las rutas REST de firma, con los mismos tipos de Zod; se quita el proxy `/escuela` de `astro.config.mjs`. Pantallas, textos y URL de las páginas no cambian.
- **Se quita el módulo `school-proxy`** de la API y el servicio `api` deja de depender de n8n.
- **Pruebas:** e2e de Jest por módulo en `api/test/` contra el stack real, que sustituyen a `escuela/pruebas/pruebas.sh` (397 casos) cubriendo los mismos criterios de las SPEC 07 y 08; la suite de Playwright se mantiene (30 pruebas) y se adapta solo en lo que ya no existe (rutas de red). Colección de Postman de la escuela en `api/postman/`.

**No entra:**

- Borrar n8n, su base, sus carpetas y sus variables (SPEC 11). n8n queda corriendo sin usarse al terminar esta spec.
- Reproducción protegida de videos, clave de cifrado entregable, URL firmadas de lectura y marca de agua (SPEC 12).
- Inscripción, avance, preguntas, rutas, estrellas, testimonios, FAQ e IA (SPEC 13 a 16).
- Cambiar reglas de negocio, textos, URL de páginas o diseño.
- Cola persistente del transcodificador, varias calidades y limpieza de subidas abandonadas.
- Borrar cursos y cerrar el acceso directo a Supabase por Kong.
- Caché de respuestas del lado del servidor y suscripciones de GraphQL.

## Modelo de datos

**Base `plataforma`, esquema `escuela`** (migraciones en `api/src/database/migrations/`): el DDL de `escuela/sql/000_extensiones.sql`, `001_esquema_escuela.sql`, `002_temario.sql` y `003_videos.sql`, tal cual (mismos nombres, tipos, `CHECK`, índices únicos parciales, restricciones diferidas de posición y la columna generada `busqueda`). Se reparte en migraciones pequeñas (`CreateSchoolCore`, `CreateSyllabus`, `CreateTeam`, `CreateVideos`) y se escriben a mano, sin `synchronize`.

**Entidades de TypeORM** por módulo, con `schema: 'escuela'` y columnas `snake_case` en español: `UserRole`, `InstructorProfile`, `Category`, `Course`, `Section`, `Lesson`, `TeamMember`, `TeamInvitation`, `LessonVideo` y `VideoKey`. `Course.busqueda` se declara solo lectura. Las posiciones se renumeran en una transacción, con la restricción `DEFERRABLE INITIALLY DEFERRED` ya existente.

**Reglas que no cambian** (se copian de las SPEC 07 y 08): slug fijado al crear con sufijo `-2`, `-3`…; invitaciones que caducan a los 7 días y se cierran como `cancelada` al reinvitar; rol `equipo_apoyo` que se quita cuando el usuario ya no está en ningún equipo; curso completo para enviar a revisión (más `falta_video`); edición según el estado (`CURSO_EN_REVISION`); estados de video `esperando_archivo → en_cola → procesando → listo | error`; un vigente y uno en proceso por clase; tiempo máximo de 45 minutos.

**Copia de datos:** `copy-school-data.sh` hace `pg_dump --data-only` de `n8n.escuela` hacia `plataforma.escuela` (las columnas generadas se omiten solas), sin tocar la base de origen, con `setval` de todas las secuencias, y compara conteos por tabla al terminar.

**Variables:** nada nuevo en el `.env`. El servicio `api` recibe `SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SECRETO_TRANSCODIFICADOR` y `URL_TRANSCODIFICADOR`; el servicio `transcodificador` cambia `URL_CALLBACK` a `http://api:3000/api/v1/interno/video-procesado`.

**Errores:** se reutilizan todos los de las SPEC 07 y 08. No hay errores nuevos.

## Plan de implementación

1. **Esquema, extensión y copia de datos.** Migraciones del esquema `escuela`, `unaccent` en `plataforma.sql` y en `create-platform-database.sh`, entidades y `copy-school-data.sh`. Comprobar: las migraciones se aplican dos veces sin cambios, `escuela.sin_acentos('Fisiología')` da `Fisiologia`, el script copia y los conteos por tabla coinciden con `n8n.escuela`, y repetirlo da el mismo resultado.
2. **Roles, categorías y administración.** Módulos `roles`, `categories` y `users-admin`; `@Roles` desde la base; `CourseAccessPolicy`; `mis_roles`, `buscar_usuario`, `asignar_rol` (con `perfiles_instructor`), `categorias`, `guardar_categoria`, `borrar_categoria`. Comprobar con e2e: `SIN_PERMISO` a quien no es administrador, `CATEGORIA_EN_USO`, `CATEGORIA_DUPLICADA`.
3. **Cursos y temario.** Módulos `courses` y `syllabus`: `crear_curso` (slug), `editar_curso`, `mis_cursos`, `curso_edicion`, secciones, clases y `mover`, con `CURSO_EN_REVISION`. Costo de GraphQL con multiplicadores de lista. Comprobar: posiciones siempre `1..n`, dueño y equipo con sus permisos.
4. **Catálogo público.** Módulo `catalog`: `categorias`, `cursos` (búsqueda de texto completo en español sin acentos, filtros, 12 por página) y `curso`, sin token y sin campos internos. Comprobar: "anatomia" encuentra "Anatomía básica", un borrador no aparece y su ficha da `NO_ENCONTRADO`.
5. **Revisión.** Módulo `review`: `enviar_revision` (`CURSO_INCOMPLETO` con `detalles`), `cursos_en_revision`, `resolver_revision`, `retirar_curso`. En este paso `falta_video` ya se evalúa contra `videos_clase`.
6. **Portadas.** Módulo `covers`: firma REST, `confirmar_portada`, borrado de la anterior, scripts de buckets en `api/scripts/`. Comprobar: PNG válido sube y se ve sin sesión; GIF o más de 2 MB da `PORTADA_INVALIDA`.
7. **Equipo e invitaciones.** Módulos `team` y `mail`: `mi_equipo`, `invitar_equipo`, `mis_invitaciones`, `responder_invitacion`, `cancelar_invitacion`, `quitar_miembro`, correo por SMTP. Comprobar con Mailpit: correo en español sin enlaces, caducidad, y retiro del rol al quitar.
8. **Videos.** Módulo `videos`: firma REST, `confirmar_subida_video`, `estado_video` (con el tiempo máximo), `reintentar_video`, `borrar_video`, webhook interno, borrado de archivos al borrar clase y sección. Comprobar de punta a punta con el transcodificador real (el original se borra, la lista trae `METHOD=AES-128`, la clave sale de `claves_video`), reemplazo sin perder el vigente, y un archivo corrupto termina en `error`.
9. **Front.** La capa de API de cada funcionalidad usa GraphQL y las firmas REST; se regenera el manifiesto de consultas persistidas; se quita el proxy `/escuela`. Comprobar: `npx playwright test` en verde apuntando al servidor de desarrollo con los datos copiados.
10. **Corte.** Detener las escrituras a n8n (se desactivan sus workflows de la escuela), volver a ejecutar `copy-school-data.sh`, apuntar `URL_CALLBACK` del transcodificador a la API, quitar el módulo `school-proxy` y `depends_on: n8n` del servicio `api`, y borrar `escuela/pruebas/pruebas.sh` una vez cubiertos sus casos por Jest. Comprobar todas las suites contra el stack, con n8n corriendo pero sin recibir tráfico (se confirma en sus ejecuciones).
11. **Contrato y documentación.** `api/README.md` (módulos, operaciones, firmas, webhook), colección de Postman de la escuela en `api/postman/`, `frontend/README.md`. Repasar los criterios.

## Criterios de aceptación

- [x] `npm test` (231 pruebas) y `npm run test:e2e` (352 pruebas en 18 suites) en `api/` terminan con código 0, `npm run build` y `npm run lint` pasan, y los casos de las SPEC 07 y 08 (permisos, límites, errores, flujos) están cubiertos por las suites de Jest, que sustituyen a los 397 casos de `pruebas.sh` (ya borrado).
- [x] `npx playwright test` (32 pruebas), `npm run build` y `npx astro check` (0 errores) del front pasan, `frontend/scripts/verificar_tamano.sh` pasa y `bash scripts/check-names.sh todo` termina con código 0.
- [x] Las migraciones se aplican dos veces sin cambios y `copy-school-data.sh` se ejecutó dos veces en el corte con el mismo resultado: los conteos de cada tabla de `plataforma.escuela` coincidieron con `n8n.escuela` y las secuencias quedan por delante del máximo id (hoy los conteos ya no coinciden porque la escuela se usa en `plataforma`; ver las notas).
- [x] Un usuario sin sesión recibe `TOKEN_INVALIDO` (`errors[].extensions.codigo`, con HTTP 200) en las 30 operaciones restantes salvo `categorias`, `cursos` y `curso`, que responden con datos. En producción, una operación fuera del manifiesto da `400 CONSULTA_NO_PERMITIDA` y no hay introspección.
- [x] Un usuario sin rol `administrador` recibe `SIN_PERMISO` en `buscar_usuario`, `asignar_rol`, `guardar_categoria`, `borrar_categoria`, `cursos_en_revision`, `resolver_revision` y `retirar_curso`. Tras `asignar_rol` con `instructor` existe su fila en `perfiles_instructor`.
- [x] `crear_curso` por un no instructor da `SIN_PERMISO`; por un instructor devuelve el slug sin acentos y un segundo curso con el mismo título recibe `-2`. Editar, mover o borrar en un curso ajeno da `SIN_PERMISO`.
- [x] Tras subir, bajar y borrar secciones y clases, las posiciones de cada nivel son exactamente `1..n`. Un curso `en_revision` rechaza edición y temario con `CURSO_EN_REVISION`.
- [x] `enviar_revision` de un curso sin portada, con una sección vacía y una clase sin video listo da `CURSO_INCOMPLETO` con `falta_portada`, `seccion_vacia` y `falta_video` en `detalles`; con todo completo envía el curso. Aprobar fija `publicado_en` y el curso aparece en `cursos`; `retirar_curso` lo quita y su ficha da `NO_ENCONTRADO`.
- [x] La búsqueda de `anatomia`, `ANATOMÍA` y del nombre del instructor encuentra el curso "Anatomía básica"; los filtros reducen el resultado y con 13 cursos publicados hay 2 páginas. `curso` no devuelve `instructor_id`, `comentario_revision`, `estado` ni correos.
- [x] La firma de portada con `image/gif` o más de 2 097 152 bytes da `422 PORTADA_INVALIDA`; subir un PNG válido y `confirmar_portada` deja la portada accesible sin sesión y borra la anterior.
- [x] `invitar_equipo` con un correo sin cuenta da `USUARIO_NO_REGISTRADO`; con uno registrado envía a Mailpit un correo en español sin enlaces; repetirlo da `INVITACION_DUPLICADA`. El invitado acepta en `/panel`, obtiene `equipo_apoyo` y edita el temario pero no puede `editar_curso`, `enviar_revision`, portada ni `invitar_equipo`. Una invitación caducada no aparece y se puede reinvitar. `quitar_miembro` retira el acceso y el rol si no está en otro equipo.
- [x] La firma de video con `video/avi`, 0 o 1 073 741 825 bytes, un campo extra o sin `nombre_archivo` da `VIDEO_INVALIDO` o validación; con 1 073 741 824 y `video/mp4` da `201`. Una segunda solicitud sin terminar la primera da `VIDEO_EN_PROCESO`. Un curso `en_revision` rechaza firma, confirmar, reintentar y borrar con `CURSO_EN_REVISION`.
- [x] Subir un MP4 con la URL firmada, `confirmar_subida_video` y esperar: en menos de 2 minutos `estado_video` lo muestra `listo` con `duracion_segundos` real (±1 s); en Storage quedan `lista.m3u8` con `METHOD=AES-128` y los segmentos bajo `cursos/<curso>/secciones/<sección>/clases/<clase>/<video>/hls/`, sin `original.*`; un segmento descifrado con la clave de `claves_video` es un TS válido.
- [x] Ninguna respuesta de la API (GraphQL, REST y errores) contiene la clave de cifrado ni `clave_hex`. Un archivo corrupto termina en `error` con el original conservado y `reintentar_video` lo devuelve a `en_cola`; un video de 31 minutos da "dura más de 30 minutos".
- [x] Reemplazar un video deja el anterior vigente hasta que el nuevo queda `listo`, y entonces sus archivos desaparecen de Storage. `borrar_video`, `borrar_clase` y `borrar_seccion` borran filas y archivos. Un video `en_cola` con 46 minutos sin cambios aparece como `error` con "El procesamiento tardó demasiado.".
- [x] `POST /api/v1/interno/video-procesado` sin la cabecera secreta o con una equivocada da `403`; con el secreto marca `listo` o `error`. El puerto del transcodificador sigue sin publicarse.
- [x] La API ya no tiene el módulo `school-proxy`, el servicio `api` no depende de n8n y las rutas `/escuela/*` responden `404`. Todas las suites pasan con n8n sin workflows activos y sin tráfico: su `execution_entity` se queda en 7 filas.
- [x] Ningún archivo de `api/`, `frontend/` ni `scripts/` contiene el valor de `SERVICE_ROLE_KEY`, `SECRETO_TRANSCODIFICADOR`, `JWT_SECRET` ni `CONTRASENA_BD_PLATAFORMA` (ni de otra variable secreta del `.env`) en claro; solo aparecen sus nombres y valores ficticios de pruebas unitarias.
- [x] `api/README.md` documenta módulos, operaciones GraphQL, rutas REST, permisos y el webhook; la colección de Postman de la escuela (`api/postman/medical-school-school.postman_collection.json`, generada con `api/scripts/generate-school-postman.py`) es JSON válido sin secretos.

## Decisiones tomadas y descartadas

**Alcance y división:**

- **Tomada: migrar toda la escuela, videos incluidos, en esta spec, y dejar el borrado de n8n para la 11.** Los videos dependen por clave foránea de clases y cursos; con los datos repartidos en dos bases la subida de video fallaría para cursos nuevos. **Descartado:** la división original (escuela sin videos primero), que dejaba la aplicación rota entre medias.
- **Tomada: corte único en el paso 10.** Los módulos se prueban contra una copia de los datos mientras n8n sigue sirviendo, y solo en el corte se recopia y se cambia el front. **Descartada:** migración endpoint por endpoint, que obligaría a mantener dos fuentes de verdad en dos bases.

**Contrato:**

- **Tomada: dominio en GraphQL y bordes en REST** (regla de la SPEC 09). Las firmas de subida y el webhook son REST; confirmar subida, reintentar y borrar son mutaciones porque son acciones de dominio. **Descartado:** todo en GraphQL (el webhook y las firmas no son consultas) y todo en REST.
- **Tomada: campos de GraphQL en español y `snake_case`**, igual que los cuerpos de hoy, para que los tipos de Zod del front no cambien. **Descartado:** `camelCase` o inglés, que obligaban a mapear.
- **Tomada: el contrato de datos (campos, códigos, reglas) no cambia; solo el transporte.** Es la manera de comprobar que la migración no rompió nada. **Descartado:** aprovechar para redefinir reglas.
- **Tomada: catálogo público en GraphQL sin token**, con las mismas protecciones. **Descartado:** dejar el catálogo en REST para cachearlo con CDN, que no aporta nada sin dominio ni CDN.

**Datos y seguridad:**

- **Tomada: DDL escrito a mano en migraciones, idéntico a las SPEC 07 y 08.** Garantiza el mismo comportamiento (índices parciales, restricciones diferidas, columna generada). **Descartado:** dejar que TypeORM lo genere desde las entidades.
- **Tomada: la clave AES-128 con `crypto.randomBytes(16)` en NestJS.** En n8n había que usar `pgcrypto` por limitación de su Code node, que aquí no existe. Sigue sin salir en ninguna respuesta.
- **Tomada: permisos desde la base con una política única reutilizable.** El claim `role` del token solo dice `authenticated`. **Descartado:** copiar la comprobación en cada resolver, igual que se descartó copiarla en cada workflow.
- **Tomada: el webhook del transcodificador exige la cabecera secreta y responde `403` sin ella.** Al desaparecer Caddy, el puerto 3000 es el único y no se puede dejar el webhook "sin ruta pública". **Descartado:** un segundo puerto interno, que complica el compose para el mismo nivel de protección que el secreto.

**Notas de implementación** (verificadas en el repaso del paso 11):

- **Pruebas:** `pruebas.sh` (397 casos) se sustituyó por Jest: 231 pruebas unitarias (28 suites) y 352 e2e (18 suites, unas 4 minutos en serie), no una por una con los 397. La suite de Playwright quedó en **32 pruebas** (la spec preveía 30; `graphql.spec.ts` añadió las comprobaciones del hash persistido). La frase "n8n desactivado" del criterio pasó a "sin workflows activos y sin tráfico": se comprobó con `execution_entity` de `n8n` en 7 filas antes y después de todas las suites.
- **Contrato de GraphQL:** responde `200` con `errors[].extensions.codigo` (y `detalles` si los hay) en los errores de dominio; el estado HTTP de la tabla de errores es el de REST. Solo los fallos previos a ejecutar (límites, lista blanca, complejidad) llevan su propio estado. Las operaciones son **33** (12 consultas y 21 mutaciones, contando `yo` de la SPEC 09) y `buscar_usuario` devuelve además `verificado`.
- **`detalles`:** el campo `regla` de algunas validaciones de entrada cambió de nombre respecto a los workflows de n8n (las reglas las nombran ahora los DTO de class-validator); los códigos, los `campo` y los mensajes se conservan. La firma de portada responde `201` (n8n respondía `200`).
- **Copia de datos:** los conteos de `plataforma.escuela` y `n8n.escuela` coincidieron en el corte (el script se ejecutó dos veces con el mismo resultado) y ya no coinciden: la escuela se usa en `plataforma` y las suites borran sus datos `e2e-*`, que `n8n` conserva. Por eso `school-copy.e2e-spec.ts` dejó de comparar conteos (fallaba tras correr Playwright) y ahora comprueba las tablas, las secuencias y que las filas nuevas no choquen con los ids. **No vuelvas a ejecutar `copy-school-data.sh`**: vacía `plataforma.escuela` y borraría lo creado desde el corte. Queda como histórico hasta la SPEC 11.
- **Costo:** `cursos_en_revision` multiplica por 1 (un curso con árbol completo), no por 50, para que quepa bajo el costo máximo de 1000; el multiplicador es una estimación por nombre de campo, no trunca respuestas.
- **Postman:** la colección `escuela/postman/` apunta a las rutas `/escuela/*` ya inexistentes y se borra con n8n en la SPEC 11; la vigente es `api/postman/medical-school-school.postman_collection.json` (33 operaciones por hash persistido, más una carpeta de desarrollo con la consulta completa, las dos firmas REST y el webhook), generada desde el manifiesto.
- **Residuos de las suites (no se limpian a propósito):** cada ejecución deja cuentas `e2e-*` y `prueba_e2e_*` y sus archivos de Storage hasta que la siguiente las borra al empezar; también quedan filas de `autenticacion.intentos_inicio_sesion` y una cuenta `ana.prueba@example.com`. El usuario decide si las borra.

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La copia de datos pierde filas o desfasa secuencias | El script compara conteos por tabla, ajusta secuencias y se puede repetir. Se ejecuta de nuevo en el corte, con las escrituras a n8n detenidas |
| Datos escritos en n8n entre la copia y el corte | El corte desactiva primero los workflows de la escuela, copia después y solo entonces cambia el front |
| El costo de GraphQL no cuenta bien las listas (el catálogo y el temario son árboles) | Multiplicadores por lista en la regla de costo y pruebas con una consulta de curso completo y otra de la página de 12 cursos |
| El front envía consultas fuera del manifiesto y producción las rechaza | `npm run build` del front ejecuta el codegen y la prueba de Playwright verifica que cada operación del front va por hash |
| El transcodificador sigue llamando a n8n tras el corte | `URL_CALLBACK` se cambia en el corte y un criterio comprueba un video de punta a punta con n8n sin tráfico |
| El webhook interno queda alcanzable desde el host por el puerto 3000 | Cabecera secreta obligatoria y `403` sin ella; el riesgo se limita a quien conozca el secreto, que solo comparten la API y el transcodificador |
| Reescribir 397 casos de `pruebas.sh` deja huecos | Cada criterio de las SPEC 07 y 08 se mapea a una suite de Jest antes de borrar el script |
| Reglas de negocio que cambian sin querer al reescribir en TypeScript | Mismas pruebas de aceptación de las SPEC 07 y 08 contra la API nueva y la suite de Playwright sin relajar |
| La spec es grande (11 pasos, unas 40 operaciones) | Cada paso deja el sistema funcionando y se prueba por separado; los pasos 6, 7 y 8 se pueden pasar a otra spec sin romper nada |

## Qué **no** hay en esta spec

- Borrar n8n, su base, su carpeta y sus variables (SPEC 11).
- Reproducción, clave de cifrado entregable, URL firmadas de lectura y marca de agua (SPEC 12).
- Inscripción, avance, preguntas, rutas, estrellas, testimonios, FAQ e IA.
- Cambios de reglas de negocio, textos, URL o diseño.
- Cola persistente, varias calidades, limpieza de subidas abandonadas y borrado de cursos.

Cada uno de esos puntos, si llega, va en su propia spec.
