# API de la escuela

Roles, cursos con secciones y clases, revisión por un administrador, portadas, catálogo público con buscador y equipos de apoyo. El **backend son workflows de n8n** sobre un esquema `escuela` de la base `n8n`; **Caddy** es la única entrada, **Supabase Auth** valida las sesiones y **Supabase Storage** guarda las portadas. Definida en `specs/07-roles-cursos-secciones-catalogo.md`. Los videos, el avance, las preguntas, las rutas de aprendizaje y las calificaciones llegan en las specs 08 a 12.

```
front ──► Caddy 127.0.0.1:8080 ──► n8n (webhooks) ──► Postgres (esquema escuela, base n8n)
                                          ├─► Supabase Auth  (auth:9999: sesión y API admin)
                                          ├─► Supabase Storage (storage:5000: URL firmada de portadas)
                                          └─► SMTP (Mailpit en local): aviso de invitación
```

- Base URL local: `http://127.0.0.1:8080`. Todo es JSON y los identificadores van en `snake_case` y en español.
- Las rutas son `/escuela/*`. Con sesión se manda `Authorization: Bearer <token_acceso>` (el de `/autenticacion/iniciar-sesion`); no usan cookies, así que no hay CSRF.
- Los errores tienen el mismo formato que la API de autenticación: `{ "error": { "codigo", "mensaje", "detalles"? } }`.

## Roles y permisos

Todo usuario es **estudiante** de forma implícita (no se guarda). Los demás roles viven en `escuela.roles_usuario` y un usuario puede tener varios.

| Rol | Cómo se obtiene | Qué puede |
|---|---|---|
| `administrador` | el primero con `scripts/crear_administrador.sh`; después, otro administrador desde `/admin/roles` | roles, categorías, revisar y retirar cursos |
| `instructor` | lo da un administrador | crear y editar sus cursos, enviarlos a revisión, subir su portada y armar su equipo de apoyo |
| `equipo_apoyo` | se obtiene al **aceptar una invitación** de un instructor; se pierde al salir del último equipo | editar el temario y marcar clases muestra de **todos los cursos de su instructor** (no los datos del curso) |

| Acción | Quién |
|---|---|
| Catálogo, ficha y categorías | cualquiera, sin cuenta |
| Crear y editar datos del curso, portada, enviar a revisión, invitar o quitar del equipo | el instructor dueño |
| Editar el temario y marcar `es_muestra` | el instructor dueño y su equipo de apoyo (no en revisión) |
| Ver y responder sus invitaciones | cualquier cuenta con sesión |
| Roles, categorías y revisión | `administrador` |

Un administrador no puede quitarse a sí mismo el rol (`409 ESTADO_INVALIDO`).

## Endpoints

Un workflow por endpoint, con el nombre de la tabla. Sin permiso, los endpoints protegidos responden `401 TOKEN_INVALIDO` (sin sesión) o `403 SIN_PERMISO`; el permiso se comprueba **antes** que los datos.

| Método y ruta | Auth | Entrada → salida |
|---|---|---|
| `GET /escuela/categorias` (*Categorias*) | no | → `{ categorias: [{ id, nombre, slug, posicion }] }` |
| `GET /escuela/cursos?q=&categoria=&nivel=&pagina=` (*Cursos*) | no | → `{ cursos: [tarjeta], total, pagina, paginas }`; solo `publicado`, 12 por página |
| `GET /escuela/curso?slug=` (*Curso publico*) | no | → ficha con `secciones[].clases[]`; `404` si no está publicado |
| `GET /escuela/mis-roles` (*Mis roles*) | sesión | → `{ roles, equipos: [{ instructor_id, nombre_publico }] }` |
| `GET /escuela/mis-invitaciones` (*Mis invitaciones*) | sesión | → `{ invitaciones }` pendientes y vigentes |
| `POST /escuela/responder-invitacion` (*Responder invitacion*) | sesión | `{ invitacion_id, aceptar }` → `200 { aceptada }` |
| `GET /escuela/mis-cursos` (*Mis cursos*) | instructor, equipo | → `{ cursos }` propios o de sus instructores, en cualquier estado |
| `GET /escuela/curso-edicion?id=` (*Curso para edicion*) | dueño, equipo | → curso completo con temario, estado, comentario y `es_dueno` |
| `POST /escuela/crear-curso` (*Crear curso*) | instructor | `{ titulo }` → `201 { id, slug }` |
| `POST /escuela/editar-curso` (*Editar curso*) | dueño | `{ curso_id, titulo?, subtitulo?, descripcion?, conocimientos_previos?, lo_que_aprenderas?, nivel?, categoria_id? }` → `200 { id }` |
| `POST /escuela/guardar-seccion` (*Guardar seccion*) | dueño, equipo | `{ curso_id, seccion_id?, titulo }` → `200 { id }` |
| `POST /escuela/borrar-seccion` (*Borrar seccion*) | dueño, equipo | `{ seccion_id }` → `204` (borra sus clases) |
| `POST /escuela/guardar-clase` (*Guardar clase*) | dueño, equipo | `{ seccion_id, clase_id?, titulo, descripcion?, duracion_estimada_minutos?, es_muestra }` → `200 { id }` |
| `POST /escuela/borrar-clase` (*Borrar clase*) | dueño, equipo | `{ clase_id }` → `204` |
| `POST /escuela/mover` (*Mover*) | dueño, equipo | `{ tipo: 'seccion' \| 'clase', id, direccion: 'subir' \| 'bajar' }` → `200 { movido }` |
| `POST /escuela/enviar-revision` (*Enviar a revision*) | dueño | `{ curso_id }` → `200 { estado }` |
| `POST /escuela/url-subida-portada` (*URL de subida de portada*) | dueño | `{ curso_id, tipo_contenido, tamano_bytes }` → `{ url_subida, ruta }` |
| `POST /escuela/confirmar-portada` (*Confirmar portada*) | dueño | `{ curso_id, ruta }` → `200 { portada_url }` |
| `GET /escuela/mi-equipo` (*Mi equipo*) | instructor | → `{ miembros, invitaciones }` |
| `POST /escuela/invitar-equipo` (*Invitar al equipo*) | instructor | `{ correo }` → `201 { id, expira_en, correo_enviado }` |
| `POST /escuela/cancelar-invitacion` (*Cancelar invitacion*) | instructor | `{ invitacion_id }` → `204` |
| `POST /escuela/quitar-miembro` (*Quitar miembro*) | instructor | `{ miembro_id }` → `204` |
| `GET /escuela/admin/buscar-usuario?correo=` (*Buscar usuario*) | administrador | → `{ id, correo, nombre, verificado, roles }` o `404` |
| `POST /escuela/admin/asignar-rol` (*Asignar rol*) | administrador | `{ usuario_id, rol: 'instructor' \| 'administrador', activo }` → `200` |
| `POST /escuela/admin/guardar-categoria` (*Guardar categoria*) | administrador | `{ id?, nombre, posicion }` → `200 { id }` |
| `POST /escuela/admin/borrar-categoria` (*Borrar categoria*) | administrador | `{ id }` → `204` |
| `GET /escuela/admin/cursos-en-revision` (*Cursos en revision*) | administrador | → `{ cursos }` con su temario, del más antiguo al más reciente |
| `POST /escuela/admin/resolver-revision` (*Resolver revision*) | administrador | `{ curso_id, aprobar, comentario? }` → `200 { estado }`; el comentario es obligatorio al devolver |
| `POST /escuela/admin/retirar-curso` (*Retirar curso*) | administrador | `{ curso_id, comentario }` → `200 { estado: 'borrador' }` |

Notas del contrato:

- **Los `POST` no aceptan campos extra** y las consultas `GET` tampoco parámetros extra (`422 VALIDACION_FALLIDA` con una regla por campo en `detalles`). Un campo vacío es un error salvo que sea opcional.
- **`editar-curso` solo toca los campos enviados**: omitir uno lo deja igual; enviar `""` o `null` vacía un campo opcional. El `slug` se fija al crear el curso y no cambia.
- **Búsqueda** (`q`): texto completo en español de Postgres sobre título, subtítulo y descripción (y el nombre público del instructor), sin acentos ni mayúsculas, ordenada por relevancia y luego por fecha.
- **Posiciones**: las secciones de un curso y las clases de una sección están siempre numeradas `1..n`; `mover` intercambia con la vecina y `borrar-*` renumera. Subir el primero o bajar el último responde `200 { movido: false }`.
- **Curso completo** para enviarlo a revisión: subtítulo, descripción, nivel, categoría, portada, al menos una sección y ninguna sección vacía. Si falta algo: `422 CURSO_INCOMPLETO` con `falta_subtitulo`, `falta_descripcion`, `falta_nivel`, `falta_categoria`, `falta_portada`, `falta_secciones` o `seccion_vacia` en `detalles`.
- **Estados**: `borrador` → `en_revision` → `publicado`. Un curso `en_revision` no se edita (`409 CURSO_EN_REVISION`); uno `publicado` sí, y los cambios se ven al momento (no vuelve a revisión). El administrador lo puede retirar.
- **Portada**: JPG, PNG o WebP de hasta 2 097 152 bytes. El navegador hace `PUT` del archivo a la `url_subida` (firmada, de un solo uso) y después llama a `confirmar-portada`; el archivo nunca pasa por n8n. Al confirmar se borra la portada anterior.
- **Invitaciones**: solo a cuentas ya **registradas y verificadas**. El invitado recibe un aviso por correo **sin enlaces** y responde en su panel. Vencen a los 7 días y entonces se puede reinvitar.

## Errores

Además de los de `auth/README.md` (`TOKEN_INVALIDO`, `VALIDACION_FALLIDA`, `DEMASIADOS_INTENTOS`…):

| Código | HTTP | Cuándo |
|---|---|---|
| `SIN_PERMISO` | 403 | sesión válida sin el rol o sin la propiedad del curso |
| `NO_ENCONTRADO` | 404 | curso, sección, clase, categoría, invitación o cuenta inexistente; un curso no publicado en la ficha pública |
| `CURSO_EN_REVISION` | 409 | editar un curso en revisión |
| `CURSO_INCOMPLETO` | 422 | enviar a revisión sin lo necesario (con `detalles`) |
| `ESTADO_INVALIDO` | 409 | transición no permitida (aprobar un borrador, retirar un no publicado, quitarte el rol de administrador, invitarte a ti mismo…) |
| `INVITACION_DUPLICADA` / `YA_ES_MIEMBRO` | 409 | ya hay una invitación vigente / ya está en el equipo |
| `USUARIO_NO_REGISTRADO` | 404 | invitar a un correo sin cuenta verificada |
| `CATEGORIA_EN_USO` / `CATEGORIA_DUPLICADA` | 409 | borrar una categoría con cursos / repetir un nombre |
| `PORTADA_INVALIDA` | 422 | tipo distinto de JPG, PNG o WebP, más de 2 MB o archivo no subido |

## Datos

Esquema `escuela` en la base `n8n` (`sql/`, idempotente). Los usuarios se guardan por su uuid de Supabase Auth, **sin clave foránea** (`auth.users` vive en otra base); por eso el nombre del instructor se copia en `perfiles_instructor`.

`roles_usuario`, `perfiles_instructor`, `categorias`, `cursos` (con `busqueda`, un `tsvector` español sin acentos), `secciones`, `clases`, `equipos_apoyo` e `invitaciones_equipo`. Una clase tiene título, descripción, duración estimada y `es_muestra`, **sin video** (SPEC 08). Disparadores (`sql/002_temario.sql`) actualizan `cursos.actualizado_en` al tocar el temario.

## Archivos

| Ruta | Qué es |
|---|---|
| `sql/000_extensiones.sql` | Extensión `unaccent` (se aplica como superusuario) |
| `sql/001_esquema_escuela.sql` | Esquema `escuela`: tablas, índices y la función `sin_acentos` |
| `sql/002_temario.sql` | Disparadores que actualizan la fecha del curso |
| `scripts/generar_workflows.py` | Genera todos los workflows de `workflows/` |
| `scripts/importar_workflows.sh` | Importa y publica los workflows en n8n |
| `scripts/revisar_notas.py` | Comprueba notas y grupos de nodos de los workflows |
| `scripts/crear_administrador.sh` | Da el rol `administrador` a una cuenta verificada |
| `scripts/crear_bucket_portadas.sh` | Crea el bucket público `portadas` |
| `scripts/crear_credencial_servicio.sh` | Crea la credencial `Supabase rol de servicio` |
| `scripts/crear_credencial_smtp.sh` | Crea la credencial `SMTP Mailpit` |
| `scripts/generar_postman.py` | Genera la colección de Postman |
| `credenciales/smtp-mailpit.json` | Credencial SMTP de Mailpit (sin secretos) |
| `plantillas/invitacion_equipo.html` | Correo de invitación (español, sin enlaces); lo incrusta el generador |
| `workflows/usuarios/`, `workflows/escuela/` | Workflows de n8n, uno por endpoint, más los subworkflows |
| `pruebas/pruebas.sh` | Pruebas de la API con `curl` |
| `postman/` | Colección y entorno de Postman |

## Workflows

Los workflows **no se dibujan a mano**: `scripts/generar_workflows.py` los genera y el JSON resultante se importa. Siguen tres reglas:

- **Carpetas de n8n.** Los de roles y sesión van en `Usuarios` (`Validar sesion y roles`, `Exigir rol`, `Buscar cuenta por correo`, `Buscar usuario`, `Asignar rol`, `Mis roles`) y el resto en `Escuela`. Cada subcarpeta de `workflows/` es la carpeta de n8n del mismo nombre.
- **Grupos de nodos y notas.** Cada tramo de lógica es un **grupo de nodos colapsable** con su **nota adhesiva**, y cada workflow tiene una nota general. Colores: amarillo = permisos, verde = entrada, morado = datos, azul = respuesta, rojo = errores, gris = nota general. `scripts/revisar_notas.py` comprueba que cada nodo quede dentro de una nota, que ninguna nota pise a otra y que cada grupo sea conexo, sin disparadores y con una sola entrada y una sola salida.
- **Lo que se repite va en un subworkflow**, nunca se copia:

| Subworkflow | Qué hace | Lo llaman |
|---|---|---|
| `Validar sesion y roles` | token → Supabase Auth → roles y equipos | `Exigir rol`, `Mis roles` |
| `Exigir rol` | además exige un rol (o una lista, o `cualquiera`) | todos los protegidos |
| `Validar campos` | tipos, largos, campos extra y normalización | todos los que reciben datos |
| `Validar acceso a curso` | existe, es del dueño o su equipo, no está en revisión | los de cursos, temario, revisión y portada |
| `Buscar cuenta por correo` | cuenta exacta en Supabase Auth (API admin) | `Buscar usuario`, `Invitar al equipo` |

Los subworkflows **también se publican** (n8n no ejecuta uno inactivo). Ningún workflow guarda ejecuciones y el servicio `n8n` borra su contenido en 1 o 2 minutos, como en `auth/`.

## Operación

**Base de datos** (la extensión necesita superusuario; el resto, el rol de n8n):

```bash
docker compose exec -T db psql -U postgres -d n8n -v ON_ERROR_STOP=1 < escuela/sql/000_extensiones.sql
docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -v ON_ERROR_STOP=1 < escuela/sql/001_esquema_escuela.sql
docker compose exec -T -e PGPASSWORD="$CONTRASENA_BD_N8N" db psql -h localhost -U "$USUARIO_BD_N8N" -d n8n -v ON_ERROR_STOP=1 < escuela/sql/002_temario.sql
```

**Primer administrador** (la cuenta debe existir y estar verificada; después los administradores asignan roles en `/admin/roles`):

```bash
bash escuela/scripts/crear_administrador.sh correo@ejemplo.com
```

**Storage.** El servicio `storage` guarda sus archivos en el volumen nombrado `storage-data` (las carpetas montadas desde macOS no admiten los atributos extendidos que usa). Crea el bucket y las credenciales una sola vez:

```bash
bash escuela/scripts/crear_bucket_portadas.sh        # bucket público, 2 MB, JPG/PNG/WebP
bash escuela/scripts/crear_credencial_servicio.sh    # Supabase rol de servicio (lee SERVICE_ROLE_KEY del .env)
bash escuela/scripts/crear_credencial_smtp.sh        # SMTP Mailpit
```

**Workflows.** Para cambiar uno se edita `scripts/generar_workflows.py`:

```bash
python3 escuela/scripts/generar_workflows.py && python3 escuela/scripts/revisar_notas.py
bash escuela/scripts/importar_workflows.sh           # importa, publica y reinicia n8n
```

Para un SMTP real, cambia los datos de la credencial `SMTP Mailpit` en n8n y quita el servicio `mailpit`.

**Pruebas** (con el stack levantado, desde la raíz; tardan unos minutos; limpian lo que crean):

```bash
bash escuela/pruebas/pruebas.sh
cd frontend && npx playwright test
```

## Limitaciones conocidas

- **`SERVICE_ROLE_KEY` en n8n.** La credencial `Supabase rol de servicio` salta las políticas de Storage y de Auth. La usan solo la búsqueda de cuentas y los workflows de portada, y nunca sale de n8n.
- **Sin claves foráneas entre bases:** si se borra una cuenta en Supabase Auth quedan filas huérfanas en `roles_usuario`, `equipos_apoyo` y `cursos` (aún no hay borrado de cuentas).
- **`invitar-equipo` revela si un correo tiene cuenta verificada**, aunque solo a instructores (decisión del usuario).
- **Portadas huérfanas:** si el navegador sube un archivo y nunca confirma, queda en el bucket.
- **Un curso publicado se edita sin nueva revisión;** el administrador puede retirarlo.
- **Las fichas son estáticas y cargan en el cliente** (`/curso?c=`): Google las indexa peor que con SSR.
- **Mailpit solo sirve para desarrollo,** igual que en `auth/`. El proxy `/almacen` del front solo existe en desarrollo.
- **Supabase por Kong** (`/auth/v1/*`, `/storage/v1/*` en el puerto 8000) sigue accesible con la clave `anon`, como se anotó en la SPEC 04.
