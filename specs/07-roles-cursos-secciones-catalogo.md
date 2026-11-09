# SPEC 07 — Roles, cursos con secciones y catálogo público con buscador

**Estado:** Aprobado  
**Depende de:** SPEC 06 (y, a través de ella, SPEC 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-09
**Objetivo:** Añadir roles (instructor, equipo de apoyo y administrador) y cursos con secciones y clases que el instructor arma y un administrador aprueba, publicados en un catálogo público con categorías y buscador, sobre workflows de n8n y el front de Astro.

## Por qué existe esta spec

El usuario pidió una escuela en línea completa (instructores, videos protegidos, clases muestra, avance, preguntas moderadas, rutas, calificaciones, testimonios, FAQ e IA local). Eso no cabe en una spec, así que se dividió en seis. Esta es la **primera**: crea el modelo de roles y de cursos del que dependen todas las demás. Ninguna clase tiene video todavía: aquí una clase es su título, su descripción, su duración estimada, su posición y la marca de muestra.

**Hoja de ruta acordada** (cada una será su propia spec):

| Spec | Contenido |
|---|---|
| 07 (esta) | Roles, equipos de apoyo, cursos, secciones, clases sin video, revisión, categorías, catálogo y ficha públicos |
| 08 | Subida de videos a Supabase Storage ordenada por volúmenes, recomendación de 2 a 9 minutos y aviso "¿Estás seguro de que quieres subir una clase tan grande?", HLS cifrado AES-128 con URLs firmadas, marca de agua con el correo del alumno, reproducción solo con cuenta y clases muestra |
| 09 | Inscripción gratuita y porcentaje de avance por curso |
| 10 | Preguntas de los alumnos moderadas por el equipo de apoyo: solo se publican cuando se contestan |
| 11 | Rutas de aprendizaje (mapas de avance con varios cursos) |
| 12 | Calificación con estrellas, testimonios publicados por el administrador, preguntas frecuentes y "Mejorar con IA" de los conocimientos previos con Ollama local |

## Alcance

**Entra:**
- **Roles** en el esquema nuevo `escuela` de la base `n8n`: `instructor`, `equipo_apoyo` y `administrador`. Todo usuario es estudiante de forma implícita (no se guarda), y un usuario puede tener varios roles a la vez.
- **Primer administrador** con `escuela/scripts/crear_administrador.sh <correo>`: busca el uuid en `auth.users` y le da el rol. Después, los administradores asignan y quitan los roles `instructor` y `administrador` desde `/admin/roles`.
- **Equipo de apoyo por instructor:** el instructor invita por correo a un usuario **ya registrado**. El invitado recibe un aviso por correo (sin enlaces ni códigos) y acepta o rechaza en `/panel`. La invitación caduca a los **7 días**. Al aceptar, el usuario entra al equipo y recibe el rol `equipo_apoyo`. El equipo edita el temario y marca las clases muestra de todos los cursos de su instructor.
- **Cursos con un solo instructor dueño.** Campos: título, subtítulo, descripción, conocimientos previos (texto plano), lista "lo que aprenderás", nivel, categoría y portada.
- **Temario:** secciones ordenadas, cada una con clases ordenadas (título, descripción, duración estimada en minutos y `es_muestra`). Se reordena con botones subir y bajar.
- **Revisión:** los cursos pasan por `borrador` → `en_revision` → `publicado`. Solo el instructor envía a revisión, y únicamente si el curso está completo. Un administrador aprueba o regresa el curso a borrador con un comentario, y puede retirar uno ya publicado.
- **Categorías** que crea, renombra, ordena y borra el administrador.
- **Catálogo público** sin cuenta:
  - `/cursos`, con buscador de texto completo en español que ignora los acentos (título, subtítulo, descripción y nombre del instructor), filtros de categoría y nivel, y 12 cursos por página.
  - `/curso?c=<slug>`, la ficha con todos los datos y el temario completo. Muestra la duración de cada clase y la etiqueta "Muestra" en las autorizadas, pero ningún video.
- **Cabecera:**
  - menú desplegable de categorías;
  - buscador que lleva a `/cursos?q=`;
  - enlaces "Instructor" y "Admin" según los roles.
- **Inicio:** `/` muestra los 6 cursos publicados más recientes.
- **Portada:** imagen JPG, PNG o WebP de hasta 2 MB en un bucket público `portadas` de Supabase Storage. n8n entrega una URL firmada de subida y el navegador sube el archivo por el proxy de Astro `/almacen` hacia Kong.
- **Backend:**
  - carpeta nueva `escuela/` (`sql/`, `workflows/`, `plantillas/`, `postman/`, `pruebas/`, `scripts/`, `README.md`);
  - workflows en la carpeta `Escuela` de n8n, uno por endpoint, más el subworkflow `Validar sesion y roles`;
  - rutas `/escuela/*` en Caddy y en el proxy de Astro.
- **Front:**
  - páginas `/cursos`, `/curso`, `/instructor`, `/instructor/curso`, `/instructor/equipo`, `/admin/roles`, `/admin/categorias` y `/admin/revision`;
  - sección de invitaciones en `/panel`;
  - se mantienen la regla de 50 líneas por archivo y las pruebas e2e con Playwright.

**No entra:**
- Videos, reproducción, clases muestra reproducibles y la recomendación y el aviso de duración (SPEC 08).
- Inscripción y porcentaje de avance (SPEC 09).
- Preguntas y comentarios moderados (SPEC 10).
- Rutas de aprendizaje (SPEC 11).
- Estrellas, testimonios, preguntas frecuentes y la IA de conocimientos previos (SPEC 12). Aquí `conocimientos_previos` es un texto plano.
- Pagos, precios y cupones.
- Coinstructores, borrar cursos y biografía o foto del instructor.
- Etiquetas libres y SSR o SEO de las fichas (siguen siendo estáticas y cargan en el cliente).
- Reordenar arrastrando y soltando.
- Invitar a correos sin cuenta y enlaces o códigos en la invitación.
- Una nueva revisión al editar un curso ya publicado (ver Decisiones).
- Cerrar el acceso directo a Supabase por Kong (riesgo ya anotado en SPEC 04).

## Modelo de datos

**Base `n8n`, esquema `escuela`** (`escuela/sql/`). Los scripts son idempotentes. `000_extensiones.sql` se aplica como superusuario y el resto con el rol de n8n. Los usuarios se referencian por su uuid de Supabase Auth sin clave foránea, porque `auth.users` vive en otra base.

```sql
-- 000_extensiones.sql (superusuario)
CREATE EXTENSION IF NOT EXISTS unaccent;
-- 001_esquema_escuela.sql
CREATE FUNCTION escuela.sin_acentos(text) RETURNS text IMMUTABLE ... -- envoltura inmutable de unaccent

CREATE TABLE escuela.roles_usuario (
  usuario_id uuid NOT NULL, rol text NOT NULL CHECK (rol IN ('instructor','equipo_apoyo','administrador')),
  asignado_por uuid, creado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (usuario_id, rol));

CREATE TABLE escuela.perfiles_instructor (           -- copia del nombre para buscar y mostrar sin cruzar bases
  usuario_id uuid PRIMARY KEY, nombre_publico text NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now());

CREATE TABLE escuela.categorias (
  id smallserial PRIMARY KEY, nombre text NOT NULL UNIQUE CHECK (length(nombre) BETWEEN 2 AND 60),
  slug text NOT NULL UNIQUE, posicion smallint NOT NULL);

CREATE TABLE escuela.cursos (
  id bigserial PRIMARY KEY, slug text NOT NULL UNIQUE, instructor_id uuid NOT NULL,
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 5 AND 120), subtitulo text CHECK (length(subtitulo) <= 200),
  descripcion text CHECK (length(descripcion) <= 5000), conocimientos_previos text CHECK (length(conocimientos_previos) <= 2000),
  lo_que_aprenderas text[] NOT NULL DEFAULT '{}' CHECK (cardinality(lo_que_aprenderas) <= 10),
  nivel text CHECK (nivel IN ('basico','intermedio','avanzado')), categoria_id smallint REFERENCES escuela.categorias,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','en_revision','publicado')),
  comentario_revision text, portada_ruta text, publicado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
  busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish', escuela.sin_acentos(
    coalesce(titulo,'') || ' ' || coalesce(subtitulo,'') || ' ' || coalesce(descripcion,'')))) STORED);
CREATE INDEX cursos_busqueda_idx ON escuela.cursos USING gin (busqueda);

CREATE TABLE escuela.secciones (
  id bigserial PRIMARY KEY, curso_id bigint NOT NULL REFERENCES escuela.cursos ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120), posicion smallint NOT NULL,
  UNIQUE (curso_id, posicion) DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE escuela.clases (
  id bigserial PRIMARY KEY, seccion_id bigint NOT NULL REFERENCES escuela.secciones ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120), descripcion text CHECK (length(descripcion) <= 2000),
  duracion_estimada_minutos smallint CHECK (duracion_estimada_minutos BETWEEN 1 AND 180),
  es_muestra boolean NOT NULL DEFAULT false, posicion smallint NOT NULL,
  UNIQUE (seccion_id, posicion) DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE escuela.equipos_apoyo (
  instructor_id uuid NOT NULL, miembro_id uuid NOT NULL, creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instructor_id, miembro_id));

CREATE TABLE escuela.invitaciones_equipo (
  id bigserial PRIMARY KEY, instructor_id uuid NOT NULL, miembro_id uuid NOT NULL, correo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptada','rechazada','cancelada')),
  creado_en timestamptz NOT NULL DEFAULT now(), expira_en timestamptz NOT NULL DEFAULT now() + interval '7 days',
  respondida_en timestamptz);
CREATE UNIQUE INDEX invitaciones_pendiente_unica ON escuela.invitaciones_equipo (instructor_id, miembro_id) WHERE estado = 'pendiente';
```

**Reglas:**
- **Slug:** se genera del título (minúsculas, sin acentos, guiones) con sufijo `-2`, `-3`… si ya existe. No cambia tras la primera publicación.
- **Caducidad:** una invitación `pendiente` con `expira_en < now()` se trata como caducada y se puede reenviar.
- **Rol `equipo_apoyo`:** se quita cuando el usuario ya no pertenece a ningún equipo.
- **Perfil del instructor:** `perfiles_instructor` se rellena desde Supabase Auth (`user_metadata.nombre`) al dar el rol `instructor`.
- **Curso completo:** para enviarlo a revisión necesita título, subtítulo, descripción, nivel, categoría, portada, al menos 1 sección y cada sección con al menos 1 clase. Si falta algo: `422 CURSO_INCOMPLETO` con `detalles` (`falta_portada`, `seccion_vacia`…).
- **Edición según el estado:** un curso `en_revision` no se edita (`409 CURSO_EN_REVISION`); uno `publicado` sí, y los cambios se ven al momento.

**Permisos** (los comprueba el subworkflow `Validar sesion y roles`: token → `auth:9999/user` como `quien-soy` → roles y equipos en `escuela`):

| Acción | Quién |
|---|---|
| Catálogo, ficha y categorías | cualquiera, sin cuenta |
| Crear y editar datos del curso, portada, enviar a revisión e invitar o quitar del equipo | el instructor dueño |
| Editar el temario y marcar `es_muestra` | el instructor dueño y su equipo |
| Ver y responder sus invitaciones | cualquier usuario con sesión |
| Roles, categorías y revisión | `administrador` |

**Endpoints** (todos `/escuela/*`, JSON, mismo formato de error que SPEC 04; los `POST` no aceptan campos extra):

| Método y ruta | Auth | Entrada → salida |
|---|---|---|
| `GET /escuela/categorias` | no | → `{ categorias: [{ id, nombre, slug }] }` |
| `GET /escuela/cursos?q=&categoria=&nivel=&pagina=` | no | → `{ cursos: [tarjeta], total, pagina, paginas }` (solo `publicado`, 12 por página) |
| `GET /escuela/curso?slug=` | no | → ficha con `secciones[].clases[]` (sin campos internos) o `404` |
| `GET /escuela/mis-roles` | sí | → `{ roles: [...], equipos: [{ instructor_id, nombre_publico }] }` |
| `GET /escuela/mis-invitaciones` | sí | → pendientes y vigentes del usuario |
| `POST /escuela/responder-invitacion` | sí | `{ invitacion_id, aceptar }` → `200` |
| `GET /escuela/mis-cursos` | instructor/equipo | → cursos propios o de sus instructores, en cualquier estado |
| `GET /escuela/curso-edicion?id=` | instructor/equipo | → curso completo para el editor |
| `POST /escuela/crear-curso` | instructor | `{ titulo }` → `201 { id, slug }` |
| `POST /escuela/editar-curso` | dueño | `{ curso_id, ...campos }` → `200` |
| `POST /escuela/guardar-seccion` | dueño/equipo | `{ curso_id, seccion_id?, titulo }` → `200 { id }` |
| `POST /escuela/borrar-seccion` | dueño/equipo | `{ seccion_id }` → `204` (borra sus clases) |
| `POST /escuela/guardar-clase` | dueño/equipo | `{ seccion_id, clase_id?, titulo, descripcion?, duracion_estimada_minutos?, es_muestra }` → `200 { id }` |
| `POST /escuela/borrar-clase` | dueño/equipo | `{ clase_id }` → `204` |
| `POST /escuela/mover` | dueño/equipo | `{ tipo: 'seccion'\|'clase', id, direccion: 'subir'\|'bajar' }` → `200` |
| `POST /escuela/enviar-revision` | dueño | `{ curso_id }` → `200` |
| `POST /escuela/url-subida-portada` | dueño | `{ curso_id, tipo_contenido, tamano_bytes }` → `{ url_subida, ruta }` |
| `POST /escuela/confirmar-portada` | dueño | `{ curso_id, ruta }` → `200 { portada_url }` |
| `GET /escuela/mi-equipo` | instructor | → miembros e invitaciones |
| `POST /escuela/invitar-equipo` | instructor | `{ correo }` → `201` |
| `POST /escuela/cancelar-invitacion` | instructor | `{ invitacion_id }` → `204` |
| `POST /escuela/quitar-miembro` | instructor | `{ miembro_id }` → `204` |
| `GET /escuela/admin/buscar-usuario?correo=` | admin | → `{ id, correo, nombre, roles }` o `404` |
| `POST /escuela/admin/asignar-rol` | admin | `{ usuario_id, rol: 'instructor'\|'administrador', activo }` → `200` |
| `POST /escuela/admin/guardar-categoria` | admin | `{ id?, nombre, posicion }` → `200 { id }` |
| `POST /escuela/admin/borrar-categoria` | admin | `{ id }` → `204` |
| `GET /escuela/admin/cursos-en-revision` | admin | → lista |
| `POST /escuela/admin/resolver-revision` | admin | `{ curso_id, aprobar, comentario? }` → `200` (comentario obligatorio si no se aprueba) |
| `POST /escuela/admin/retirar-curso` | admin | `{ curso_id, comentario }` → `200` (vuelve a `borrador`) |

**Errores nuevos:**

| Código | HTTP | Cuándo |
|---|---|---|
| `SIN_PERMISO` | 403 | sesión válida sin el rol o sin la propiedad del curso |
| `NO_ENCONTRADO` | 404 | curso, sección, clase, categoría, invitación o usuario inexistente; los cursos no publicados también dan `404` en la ficha pública |
| `CURSO_EN_REVISION` | 409 | edición de un curso en revisión |
| `CURSO_INCOMPLETO` | 422 | enviar a revisión sin los requisitos (con `detalles`) |
| `ESTADO_INVALIDO` | 409 | transición no permitida (por ejemplo, aprobar un borrador) |
| `INVITACION_DUPLICADA` / `YA_ES_MIEMBRO` | 409 | ya hay una invitación vigente o el usuario ya está en el equipo |
| `USUARIO_NO_REGISTRADO` | 404 | invitar a un correo sin cuenta verificada |
| `CATEGORIA_EN_USO` | 409 | borrar una categoría con cursos |
| `PORTADA_INVALIDA` | 422 | tipo distinto de JPG, PNG o WebP, más de 2 MB, o archivo no subido al confirmar |

**Storage:**
- Bucket `portadas` público, con `file_size_limit` de 2 MB y `allowed_mime_types` `image/jpeg`, `image/png` e `image/webp`.
- Ruta: `cursos/<curso_id>/portada-<uuid>.<ext>`. Al confirmar se borra la anterior.
- n8n llama a `storage:5000` y `auth:9999/admin/users` con la credencial nueva `Supabase rol de servicio` (Header Auth con la `SERVICE_ROLE_KEY`).
- El navegador sube y lee por `/almacen/*`: el proxy de Astro lo reenvía a `URL_ALMACEN`, por defecto `http://127.0.0.1:8000/storage/v1`.

**Correo de invitación:**
- n8n lo manda con el nodo Send Email y la credencial nueva `SMTP Mailpit` (`mailpit:1025`, sin TLS).
- Plantilla: `escuela/plantillas/invitacion_equipo.html`, en español, sin enlaces.

**Variables:**
- `frontend/.env.example` gana `URL_ALMACEN`.
- No hay variables nuevas en el `.env` raíz: las credenciales viven en n8n.

**Front** (`frontend/src/`, cada archivo ≤ 50 líneas):
- `api/escuela.ts`: `solicitar` de `cliente.ts` acepta un prefijo de ruta (`autenticacion` o `escuela`) sin cambiar las llamadas existentes.
- `componentes/catalogo/`: `TarjetaCurso`, `ListaCursos`, `Buscador`, `FiltrosCatalogo`, `Paginacion`, `FichaCurso`, `TemarioPublico`, `MenuCategorias`.
- `componentes/instructor/`: `ListaMisCursos`, `FormularioDatosCurso`, `EditorTemario`, `FilaSeccion`, `FilaClase`, `SubirPortada`, `BotonEnviarRevision`, `GestionEquipo`.
- `componentes/admin/`: `GestionRoles`, `GestionCategorias`, `ListaRevision`.
- `componentes/auth/`: `ListaInvitaciones` y `GuardiaRol`, que extiende `GuardiaSesion` con los roles requeridos.
- `hooks/`: `useRoles`, `useCatalogo` y `useCurso`.

## Plan de implementación

1. **Esquema y primer administrador.** Crear `escuela/sql/000_extensiones.sql` y `001_esquema_escuela.sql` y `escuela/scripts/crear_administrador.sh`, y aplicarlos. Comprobar con `psql`: las tablas existen, `escuela.sin_acentos('Anatomía') = 'Anatomia'` y el script da el rol `administrador` a un usuario de prueba.
2. **Autorización y entrada.**
   - Subworkflow `Validar sesion y roles` y workflow `Mis roles` (`GET /escuela/mis-roles`).
   - Caddy: permitir `/escuela/*` con su lista de rutas, CORS, preflight, `405`, `415` (solo en `POST`; los `GET` con query no exigen JSON) y `413`.
   - Proxy `/escuela` en `astro.config.mjs` y el prefijo en `cliente.ts`.
   - `escuela/pruebas/pruebas.sh` con los primeros casos.
   - Comprobar: `mis-roles` devuelve `["administrador"]` para el admin, `[]` para otro usuario y `401` sin token, y `auth/pruebas/pruebas.sh` sigue en 0.
3. **Administración de roles y categorías.**
   - Workflows `buscar-usuario`, `asignar-rol` (rellena `perfiles_instructor`), `guardar-categoria`, `borrar-categoria` y `categorias`.
   - Front: `GuardiaRol`, `/admin/roles`, `/admin/categorias` y los enlaces por rol en `MenuSesion`.
   - Comprobar a mano: el admin hace instructor a un usuario y crea 3 categorías.
4. **Cursos del instructor.**
   - Workflows `crear-curso`, `editar-curso`, `mis-cursos` y `curso-edicion` (slug, validación de campos, propiedad y `CURSO_EN_REVISION`).
   - Front: `/instructor` y `/instructor/curso?id=` con `FormularioDatosCurso`.
   - Comprobar: un instructor crea y edita un curso, y otro instructor recibe `403`.
5. **Temario.**
   - Workflows `guardar-seccion`, `borrar-seccion`, `guardar-clase`, `borrar-clase` y `mover`, con posiciones renumeradas en una transacción.
   - Front: `EditorTemario`, `FilaSeccion` y `FilaClase`, con botones subir y bajar y la casilla "Clase muestra".
   - Comprobar: reordenar y borrar deja las posiciones `1..n` sin huecos.
6. **Revisión.**
   - Workflows `enviar-revision`, `cursos-en-revision`, `resolver-revision` y `retirar-curso`.
   - Front: estado y comentario en el editor, `BotonEnviarRevision` con la lista de faltantes, y `/admin/revision`.
   - Comprobar: el ciclo completo borrador → en revisión → regresado → en revisión → publicado.
   - Hasta el paso 7 la portada se exige pero no se puede subir, así que este paso se prueba con `portada_ruta` puesta por SQL.
7. **Portada.**
   - Bucket `portadas` (script SQL o llamada a la API de Storage documentada en `escuela/README.md`).
   - Credencial `Supabase rol de servicio`, y workflows `url-subida-portada` y `confirmar-portada`.
   - Proxy `/almacen` en Astro y componente `SubirPortada`, que valida tipo y tamaño antes de pedir la URL.
   - Comprobar: subir un PNG de 1 MB se ve en el editor; un PDF o un JPG de 3 MB se rechazan.
8. **Catálogo público.**
   - Workflows `cursos` (búsqueda con `websearch_to_tsquery('spanish', sin_acentos(q))` sobre `busqueda` o sobre el nombre del instructor, más los filtros y la paginación) y `curso`.
   - Front: `/cursos`, `/curso?c=`, `MenuCategorias` y `Buscador` en la cabecera, y los 6 cursos recientes en `/`.
   - Comprobar: buscar "anatomia" encuentra "Anatomía básica", y un curso en borrador no aparece en el catálogo y su ficha da `404`.
9. **Equipo de apoyo.**
   - Credencial `SMTP Mailpit` y plantilla `invitacion_equipo.html`.
   - Workflows `invitar-equipo`, `mi-equipo`, `cancelar-invitacion`, `quitar-miembro`, `mis-invitaciones` y `responder-invitacion`.
   - Front: `/instructor/equipo` y `ListaInvitaciones` en `/panel`.
   - Comprobar: Mailpit recibe el aviso, el invitado acepta y edita el temario, y quitarlo le retira el permiso y el rol.
10. **Contrato, pruebas y documentación.**
    - `escuela/README.md` y la colección de Postman `escuela/postman/`.
    - `pruebas.sh` completo y pruebas Playwright en `frontend/pruebas/` (catálogo, editor, revisión, equipo y roles).
    - `frontend/README.md` actualizado. Repasar los criterios.

## Criterios de aceptación

- [ ] `escuela/pruebas/pruebas.sh` y `auth/pruebas/pruebas.sh` terminan con código 0 contra el stack levantado.
- [ ] `npx playwright test` termina con código 0, `npm run build` y `npx astro check` pasan, y `frontend/scripts/verificar_tamano.sh` pasa (ningún archivo de `src/` supera 50 líneas).
- [ ] `escuela/sql/*.sql` se puede aplicar dos veces seguidas sin errores, y `escuela.sin_acentos('Fisiología')` devuelve `Fisiologia`.
- [ ] `crear_administrador.sh` con un correo registrado deja una fila `administrador` en `roles_usuario`; con un correo inexistente termina con código distinto de 0 y no inserta nada.
- [ ] `GET /escuela/mis-roles` sin token da `401 TOKEN_INVALIDO`; un usuario recién registrado recibe `{ "roles": [], "equipos": [] }`.
- [ ] Cualquier endpoint de `/escuela/admin/*` llamado por un usuario sin rol `administrador` devuelve `403 SIN_PERMISO`.
- [ ] Tras `asignar-rol` con `instructor`, el usuario ve el enlace "Instructor" en la cabecera y existe su fila en `perfiles_instructor`. Con `activo: false` pierde el rol y el enlace.
- [ ] `crear-curso` por un usuario sin rol `instructor` da `403`. Por un instructor da `201` con un slug sin acentos; un segundo curso con el mismo título recibe el sufijo `-2`.
- [ ] Editar, mover o borrar en un curso ajeno (de otro instructor, sin pertenecer a su equipo) da `403 SIN_PERMISO`.
- [ ] Tras subir, bajar y borrar secciones y clases, las posiciones de cada nivel son exactamente `1..n`, y `mover` para subir el primer elemento no cambia nada.
- [ ] `enviar-revision` de un curso sin portada y con una sección vacía da `422 CURSO_INCOMPLETO` con `falta_portada` y `seccion_vacia` en `detalles`.
- [ ] Un curso `en_revision` rechaza `editar-curso`, `guardar-seccion` y `guardar-clase` con `409 CURSO_EN_REVISION`.
- [ ] `resolver-revision` con `aprobar: false` y sin comentario da `422`. Con comentario, el curso vuelve a `borrador` y el instructor lo ve en el editor.
- [ ] Al aprobar un curso se fija `publicado_en` y el curso aparece en `/cursos`. Tras `retirar-curso`, desaparece del catálogo y su ficha da `404`.
- [ ] Sin sesión, `/cursos` y `/curso?c=<slug>` muestran los cursos publicados y el temario. Las clases con `es_muestra` llevan la etiqueta "Muestra", y en la página no hay ningún elemento `<video>` ni ninguna URL de video.
- [ ] Buscar `anatomia`, `ANATOMÍA` y el nombre del instructor encuentra el curso "Anatomía básica". El filtro de categoría y el de nivel reducen el resultado, y con 13 cursos publicados hay 2 páginas.
- [ ] `GET /escuela/curso` no devuelve `instructor_id`, `comentario_revision`, `estado` ni ningún correo.
- [ ] La cabecera muestra el menú de categorías y el buscador en todas las páginas; elegir una categoría lleva a `/cursos?categoria=<slug>`.
- [ ] `url-subida-portada` con `image/gif` o con más de 2 097 152 bytes da `422 PORTADA_INVALIDA`. Subir un PNG válido por la URL firmada y confirmar deja `portada_url` accesible sin sesión, y la portada anterior se borra del bucket.
- [ ] `invitar-equipo` con un correo sin cuenta da `404 USUARIO_NO_REGISTRADO`. Con un correo registrado da `201` y Mailpit recibe un correo en español sin enlaces; repetirlo da `409 INVITACION_DUPLICADA`.
- [ ] El invitado ve la invitación en `/panel`; al aceptarla obtiene el rol `equipo_apoyo` y puede editar el temario y marcar clases muestra de los cursos de ese instructor, pero no `editar-curso`, `enviar-revision`, la portada ni `invitar-equipo` (`403`).
- [ ] Una invitación con `expira_en` en el pasado no aparece en `mis-invitaciones`, `responder-invitacion` la rechaza con `404`, y el instructor puede invitar de nuevo a ese correo.
- [ ] `quitar-miembro` retira el acceso al temario. Si el usuario no está en otro equipo, pierde el rol `equipo_apoyo`.
- [ ] `borrar-categoria` con cursos asignados da `409 CATEGORIA_EN_USO`.
- [ ] Las rutas `/escuela/*` responden por Caddy `405` ante un método no permitido, `415` en `POST` sin JSON y `413` ante más de 10 KB, y por el puerto 5678 directo sin el secreto del proxy responden `403`.
- [ ] Ningún workflow de `Escuela` guarda ejecuciones correctas, todos están publicados en la carpeta `Escuela` de n8n, y los nombres de workflows, nodos, campos, tablas y variables nuevas están en español.
- [ ] Ningún archivo de `escuela/` ni de `frontend/` contiene la `SERVICE_ROLE_KEY`, `SECRETO_PROXY`, `JWT_SECRET` ni el email del owner.
- [ ] `escuela/README.md` documenta cada endpoint, los errores, los permisos, cómo crear el primer administrador y cómo crear el bucket. La colección de Postman es JSON válido sin secretos.

## Decisiones tomadas y descartadas

**Alcance y división:**
- **Tomada: dividir la petición en seis specs y empezar por roles y cursos.** Todo lo demás (videos, avance, preguntas, reseñas) cuelga de este modelo. **Descartada:** una sola spec con más de 20 pasos y decisiones en seis dominios.
- **Tomada: la spec queda grande por decisión del usuario** (roles, contenido, catálogo, equipos y portada). Por eso la portada (paso 7) y el equipo (paso 9) van al final y se pueden mover a otra spec sin romper nada.

**Datos:**
- **Tomada: esquema `escuela` en la base `n8n`**, igual que `autenticacion`, con la credencial que n8n ya tiene. **Descartada:** la base `postgres` de Supabase con claves foráneas a `auth.users`, que pedía otra credencial y otro rol. Consecuencia: el nombre del instructor se copia en `perfiles_instructor`.
- **Tomada: búsqueda de texto completo de Postgres en español con `unaccent`.** **Descartados:** `ILIKE` (lento y sin raíces) y un motor externo (Meilisearch).

**Roles y permisos:**
- **Tomada: varios roles por usuario, con el estudiante implícito.** **Descartado:** un solo rol por usuario.
- **Tomada: los roles los asigna un administrador; el primero, por script.** **Descartados:** las solicitudes para ser instructor y asignarlos solo por SQL.
- **Tomada: un instructor dueño por curso.** **Descartados:** los coinstructores.
- **Tomada: equipo de apoyo por instructor, modelado ya en esta spec.** SPEC 10 solo añade la moderación. **Descartados:** equipo por curso y dejarlo todo para la 10.
- **Tomada: invitar solo a usuarios registrados**, por decisión del usuario, aunque eso le revela al instructor qué correos tienen cuenta. **Descartado:** aceptar cualquier correo con una respuesta idéntica.
- **Tomada: el correo solo avisa; se acepta en `/panel`, con caducidad de 7 días.** No hay enlaces ni códigos, igual que SPEC 05. **Descartados:** el código de 6 dígitos y que no caduque.

**Publicación y catálogo:**
- **Tomada: revisión obligatoria de un administrador** antes de publicar, con comentario al regresar el curso. **Descartado:** que el instructor publique solo.
- **Tomada: editar un curso publicado no lo devuelve a revisión.** Mantiene la spec manejable; el admin puede retirarlo. **Descartado:** versionar cursos publicados.
- **Tomada: catálogo y ficha públicos, y todo video con cuenta (SPEC 08).** Atrae gente sin romper la regla de "sí o sí con cuenta" para ver clases. **Descartados:** todo cerrado y muestras sin cuenta.
- **Tomada: fichas estáticas con carga en el cliente (`/curso?c=`).** Respeta SPEC 06. **Descartado:** SSR con `@astrojs/node` (mejor SEO; puede volver en otra spec).
- **Tomada: reordenar con botones subir y bajar.** **Descartado:** arrastrar y soltar.

**Infraestructura:**
- **Tomada: Supabase Storage con URL firmada de subida por Kong** y el proxy `/almacen` de Astro. Es el mismo camino que usarán los videos y los archivos nunca pasan por n8n ni por el límite de 10 KB de Caddy. **Descartados:** subir a través de n8n y un disco local con Caddy.
- **Tomada: nuevo `GET /escuela/mis-roles`.** **Descartado:** ampliar `/autenticacion/yo`, que cambiaba un workflow cerrado de SPEC 04.
- **Tomada: carpeta `escuela/` y prefijo `/escuela/*`.** **Descartado:** mezclarlo en `auth/`.

**Fuera de esta spec:**
- **Tomada: conocimientos previos como texto plano; la IA con Ollama va en SPEC 12.**
- **Tomadas para specs futuras, ya decididas por el usuario:** HLS cifrado AES-128 con marca de agua (SPEC 08), Supabase Storage para videos (SPEC 08) e inscripción gratuita (SPEC 09).

## Riesgos identificados

- **Spec grande (10 pasos, unos 30 workflows):** si se alarga, los pasos 7 y 9 pueden pasar a otra spec.
- **Sin claves foráneas entre bases:** si se borra un usuario en Supabase Auth quedan filas huérfanas en `roles_usuario`, `equipos_apoyo` y `cursos`. Se aceptan por ahora porque no hay borrado de cuentas.
- **`perfiles_instructor` puede quedar desfasado** si el usuario cambia su nombre (no hay edición de perfil todavía). Se refresca cada vez que se asigna el rol.
- **`invitar-equipo` revela si un correo tiene cuenta**, aunque solo a instructores (decisión del usuario).
- **`unaccent` requiere crear la extensión como superusuario** en la base `n8n`. Si la imagen de Postgres no la trae, el paso 1 lo detecta y se ajusta la spec.
- **Subida directa a Kong:** Kong publica `/storage/v1` en `127.0.0.1:8000`. El paso 7 confirma que la subida firmada funciona sin la clave `anon` y que el proxy de Astro la reenvía. Como en SPEC 06, el proxy solo existe en desarrollo.
- **Bucket `portadas` público:** cualquiera con la URL ve la imagen, lo cual se busca. Nunca debe usarse para videos (SPEC 08 usará un bucket privado).
- **Las ediciones de un curso publicado se ven al momento sin revisión:** un instructor podría cambiar el contenido aprobado. Se mitiga con `retirar-curso`.
- **Credencial `Supabase rol de servicio` en n8n:** salta todas las políticas de Storage y de Auth. Solo la usan los workflows de portada, invitación y búsqueda de usuarios, y nunca sale de n8n.
- **Fichas estáticas cargadas en el cliente:** Google las indexa peor, lo que afecta la meta de atraer gente; se reevaluará con SSR.
- **El correo de invitación depende de Mailpit en local,** igual que SPEC 05; en producción hay que apuntar la credencial SMTP a un servidor real.
