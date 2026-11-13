#!/usr/bin/env python3
"""Genera la colección de Postman de la escuela (SPEC 10, paso 11) en api/postman/ y completa el entorno local.

Uso, desde la raíz del repo:  python3 api/scripts/generate-school-postman.py
Los hashes y el texto de cada consulta salen de api/graphql/persisted-queries.json (se busca la entrada por nombre de
operación); si falta alguna de las 33 operaciones del esquema, el script falla. No lleva secretos: los valores sensibles
(`token_acceso`, `secreto_transcodificador`) quedan vacíos en el entorno.
"""
import json
import re
import uuid
from pathlib import Path

API = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((API / "graphql" / "persisted-queries.json").read_text(encoding="utf-8"))
SCHEMA = (API / "graphql" / "schema.graphql").read_text(encoding="utf-8")
NS = uuid.UUID("5c0e1a00-0000-4000-8000-000000000010")

# Nombre de la operación -> (hash con prefijo, texto)
OPERACIONES = {}
for clave, texto in MANIFEST.items():
    m = re.match(r"(query|mutation) (\w+)", texto)
    OPERACIONES[m.group(2)] = (clave, texto, m.group(1))

TOKEN = "Bearer {{token_acceso}}"
E_TOKEN = ("TOKEN_INVALIDO", "El token de acceso falta, no es válido o expiró.")
E_PERMISO = ("SIN_PERMISO", "No tienes permiso para hacer esto.")
E_REVISION = ("CURSO_EN_REVISION", "El curso está en revisión y no se puede editar.")
E_CURSO = ("NO_ENCONTRADO", "El curso no existe.")
FECHA = "2026-11-13T15:00:00.000Z"

# (carpeta, operación, sesión, variables, descripción, respuesta correcta (data), error (codigo, mensaje))
GQL = [
    ("Roles y administración", "yo", True, {}, "Cualquier cuenta con sesión. La persona del token (sin llamar a Supabase Auth).",
     {"yo": {"id": "{{usuario_id}}", "correo": "ana@example.com", "nombre": "Ana"}}, E_TOKEN),
    ("Roles y administración", "mis_roles", True, {}, "Cualquier cuenta con sesión. Roles extra (el estudiante es implícito) y equipos de apoyo a los que pertenece.",
     {"mis_roles": {"roles": ["instructor"], "equipos": []}}, E_TOKEN),
    ("Roles y administración", "buscar_usuario", True, {"correo": "{{correo_invitado}}"}, "Solo administrador. Busca una cuenta por su correo exacto: 404 NO_ENCONTRADO si no existe.",
     {"buscar_usuario": {"id": "{{usuario_id}}", "correo": "ana@example.com", "nombre": "Ana", "verificado": True, "roles": ["instructor"]}}, E_PERMISO),
    ("Roles y administración", "asignar_rol", True, {"usuario_id": "{{usuario_id}}", "rol": "instructor", "activo": True}, "Solo administrador. rol: instructor o administrador. Un administrador no puede quitarse su propio rol (ESTADO_INVALIDO). Dar instructor crea su perfil.",
     {"asignar_rol": {"usuario_id": "{{usuario_id}}", "rol": "instructor", "activo": True}}, ("ESTADO_INVALIDO", "No puedes quitarte a ti mismo el rol de administrador.")),

    ("Categorías", "categorias", False, {}, "Pública, sin sesión. Categorías ordenadas por posición.",
     {"categorias": [{"id": 1, "nombre": "Anatomía", "posicion": 10, "slug": "anatomia"}]}, ("DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes. Espera para volver a intentar.")),
    ("Categorías", "guardar_categoria", True, {"nombre": "Anatomía", "posicion": 10}, "Solo administrador. Sin id crea; con id edita. Nombre repetido: 409 CATEGORIA_DUPLICADA.",
     {"guardar_categoria": {"id": 1}}, ("CATEGORIA_DUPLICADA", "Ya existe una categoría con ese nombre.")),
    ("Categorías", "borrar_categoria", True, {"id": "{{categoria_id}}"}, "Solo administrador. Con cursos asignados: 409 CATEGORIA_EN_USO.",
     {"borrar_categoria": {"ok": True}}, ("CATEGORIA_EN_USO", "La categoría tiene cursos asignados.")),

    ("Cursos", "mis_cursos", True, {}, "Instructor o equipo de apoyo. Cursos propios y de los instructores a los que se apoya, en cualquier estado.",
     {"mis_cursos": [{"id": 1, "slug": "anatomia-basica", "titulo": "Anatomía básica", "estado": "borrador", "comentario_revision": None, "portada_ruta": None, "actualizado_en": FECHA, "es_mio": True, "instructor": "Ana"}]}, E_PERMISO),
    ("Cursos", "curso_edicion", True, {"id": "{{curso_id}}"}, "Dueño o equipo de apoyo. Curso completo con temario, estado y video de cada clase. Nunca incluye la clave de cifrado.",
     {"curso_edicion": {"id": 1, "slug": "anatomia-basica", "titulo": "Anatomía básica", "subtitulo": None, "descripcion": None, "conocimientos_previos": None, "lo_que_aprenderas": [], "nivel": None, "categoria_id": None, "estado": "borrador", "comentario_revision": None, "portada_ruta": None, "actualizado_en": FECHA, "es_dueno": True, "secciones": []}}, E_CURSO),
    ("Cursos", "crear_curso", True, {"titulo": "Anatomía básica"}, "Solo instructor. Crea un borrador y fija un slug único sin acentos (-2, -3... si se repite el título).",
     {"crear_curso": {"id": 1, "slug": "anatomia-basica"}}, E_PERMISO),
    ("Cursos", "editar_curso", True, {"curso_id": "{{curso_id}}", "subtitulo": "Huesos y músculos", "nivel": "basico", "lo_que_aprenderas": ["Nombrar los huesos"]}, "Solo el instructor dueño; no en revisión. Solo cambia los campos enviados. categoria_id desconocida: VALIDACION_FALLIDA.",
     {"editar_curso": {"id": 1}}, E_REVISION),

    ("Temario", "guardar_seccion", True, {"curso_id": "{{curso_id}}", "titulo": "Introducción"}, "Dueño o equipo de apoyo; no en revisión. Con seccion_id renombra, sin él crea al final.",
     {"guardar_seccion": {"id": 1}}, E_REVISION),
    ("Temario", "borrar_seccion", True, {"seccion_id": "{{seccion_id}}"}, "Dueño o equipo de apoyo. Borra sus clases y sus videos (con archivos) y renumera las demás.",
     {"borrar_seccion": {"ok": True}}, ("NO_ENCONTRADO", "La sección no existe en este curso.")),
    ("Temario", "guardar_clase", True, {"seccion_id": "{{seccion_id}}", "titulo": "Bienvenida", "descripcion": "Presentación del curso", "duracion_estimada_minutos": 4, "es_muestra": True}, "Dueño o equipo de apoyo. Con clase_id edita, sin él crea al final.",
     {"guardar_clase": {"id": 1}}, E_REVISION),
    ("Temario", "borrar_clase", True, {"clase_id": "{{clase_id}}"}, "Dueño o equipo de apoyo. Borra la clase y sus videos (con archivos) y renumera las demás.",
     {"borrar_clase": {"ok": True}}, E_REVISION),
    ("Temario", "mover", True, {"tipo": "clase", "id": "{{clase_id}}", "direccion": "subir"}, "Dueño o equipo de apoyo. Sube o baja una sección o una clase (tipo: seccion | clase; direccion: subir | bajar).",
     {"mover": {"ok": True}}, E_REVISION),

    ("Catálogo", "cursos", False, {"q": "anatomia", "categoria": None, "nivel": None, "pagina": 1}, "Pública, sin sesión. Búsqueda en español sin acentos, filtros y 12 cursos por página.",
     {"cursos": {"cursos": [{"slug": "anatomia-basica", "titulo": "Anatomía básica", "subtitulo": None, "nivel": "basico", "categoria": "Anatomía", "categoria_slug": "anatomia", "instructor": "Ana", "portada_ruta": None, "secciones": 1, "clases": 3}], "total": 1, "pagina": 1, "paginas": 1}},
     ("DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes. Espera para volver a intentar.")),
    ("Catálogo", "curso", False, {"slug": "{{slug}}"}, "Pública, sin sesión. Ficha con el temario (sin video ni campos internos). NO_ENCONTRADO si no está publicado.",
     {"curso": {"id": 1, "slug": "anatomia-basica", "titulo": "Anatomía básica", "subtitulo": None, "descripcion": None, "conocimientos_previos": None, "lo_que_aprenderas": [], "nivel": "basico", "categoria": {"nombre": "Anatomía", "slug": "anatomia"}, "portada_ruta": None, "instructor": "Ana", "publicado_en": FECHA, "secciones": []}},
     E_CURSO),

    ("Revisión", "enviar_revision", True, {"curso_id": "{{curso_id}}"}, "Solo el instructor dueño, desde borrador. CURSO_INCOMPLETO lleva en detalles: falta_portada, seccion_vacia, falta_video...",
     {"enviar_revision": {"estado": "en_revision"}}, ("CURSO_INCOMPLETO", "Al curso le faltan datos para enviarlo a revisión.")),
    ("Revisión", "cursos_en_revision", True, {}, "Solo administrador. Cursos pendientes con su temario completo.",
     {"cursos_en_revision": []}, E_PERMISO),
    ("Revisión", "resolver_revision", True, {"curso_id": "{{curso_id}}", "aprobar": False, "comentario": "Falta la descripción de la primera clase."}, "Solo administrador. Aprobar publica el curso; devolverlo exige comentario (VALIDACION_FALLIDA).",
     {"resolver_revision": {"estado": "borrador"}}, ("ESTADO_INVALIDO", "Solo se pueden resolver cursos que están en revisión.")),
    ("Revisión", "retirar_curso", True, {"curso_id": "{{curso_id}}", "comentario": "Contenido desactualizado."}, "Solo administrador. Un curso publicado vuelve a borrador con un comentario y sale del catálogo.",
     {"retirar_curso": {"estado": "borrador"}}, ("ESTADO_INVALIDO", "Solo se pueden retirar los cursos publicados.")),

    ("Portadas", "confirmar_portada", True, {"curso_id": "{{curso_id}}", "ruta": "{{ruta_portada}}"}, "Solo el instructor dueño; no en revisión. Comprueba el archivo en Storage, guarda la portada y borra la anterior.",
     {"confirmar_portada": {"portada_url": "/almacen/object/public/portadas/cursos/1/portada-0123456789abcdef0123456789abcdef.png"}}, ("PORTADA_INVALIDA", "La portada todavía no se subió.")),

    ("Equipo", "mi_equipo", True, {}, "Solo instructor. Miembros del equipo e invitaciones pendientes y vigentes.",
     {"mi_equipo": {"miembros": [], "invitaciones": []}}, E_PERMISO),
    ("Equipo", "mis_invitaciones", True, {}, "Cualquier cuenta con sesión. Invitaciones pendientes y vigentes recibidas.",
     {"mis_invitaciones": [{"id": 1, "instructor": "Ana", "creado_en": FECHA, "expira_en": FECHA}]}, E_TOKEN),
    ("Equipo", "invitar_equipo", True, {"correo": "{{correo_invitado}}"}, "Solo instructor. La cuenta debe estar registrada y verificada; recibe un correo sin enlaces. Vence en 7 días. correo_enviado es false si el SMTP falló (la invitación existe igual).",
     {"invitar_equipo": {"id": 1, "expira_en": FECHA, "correo_enviado": True}}, ("USUARIO_NO_REGISTRADO", "Ese correo no tiene una cuenta registrada.")),
    ("Equipo", "responder_invitacion", True, {"invitacion_id": "{{invitacion_id}}", "aceptar": True}, "La persona invitada acepta o rechaza. Aceptar da el rol equipo_apoyo.",
     {"responder_invitacion": {"aceptada": True}}, ("NO_ENCONTRADO", "La invitación no existe en este curso.")),
    ("Equipo", "cancelar_invitacion", True, {"invitacion_id": "{{invitacion_id}}"}, "Solo instructor. Cancela una invitación suya pendiente.",
     {"cancelar_invitacion": {"ok": True}}, ("NO_ENCONTRADO", "La invitación pendiente no existe en este curso.")),
    ("Equipo", "quitar_miembro", True, {"miembro_id": "{{usuario_id}}"}, "Solo instructor. Si la persona no está en otro equipo pierde el rol equipo_apoyo.",
     {"quitar_miembro": {"ok": True}}, ("NO_ENCONTRADO", "El miembro no existe en este curso.")),

    ("Videos", "estado_video", True, {"clase_id": "{{clase_id}}"}, "Dueño o equipo de apoyo (también en revisión). El video vigente y el que se sube o procesa. Uno en cola o procesando más de 45 minutos pasa a error. Consúltalo cada pocos segundos.",
     {"estado_video": {"vigente": {"id": 1, "estado": "listo", "duracion_segundos": 240, "listo_en": FECHA}, "nuevo": None}}, E_PERMISO),
    ("Videos", "confirmar_subida_video", True, {"video_id": "{{video_id}}"}, "Dueño o equipo de apoyo; no en revisión. Comprueba el archivo en Storage y lo pone en la cola del transcodificador. Sin respuesta del transcodificador: 503 SERVICIO_NO_DISPONIBLE y el video queda en error.",
     {"confirmar_subida_video": {"estado": "en_cola"}}, ("VIDEO_INVALIDO", "El video todavía no se subió.")),
    ("Videos", "reintentar_video", True, {"video_id": "{{video_id}}"}, "Dueño o equipo de apoyo. Solo un video en error cuyo original se conservó.",
     {"reintentar_video": {"estado": "en_cola"}}, ("ESTADO_INVALIDO", "Solo se puede reintentar un video con error.")),
    ("Videos", "borrar_video", True, {"clase_id": "{{clase_id}}"}, "Dueño o equipo de apoyo; no en revisión. Borra el video vigente y los que estén en proceso o con error, con sus archivos.",
     {"borrar_video": {"ok": True}}, E_REVISION),
]

# Rutas REST de los bordes: (carpeta, nombre, ruta, secreto, cuerpo, descripción, éxito (estado, cuerpo), error (estado, codigo, mensaje))
REST = [
    ("Portadas", "Firma de portada", "/api/v1/portadas/firmas", False, {"curso_id": "{{curso_id}}", "tipo_contenido": "image/png", "tamano_bytes": 120000},
     "Solo el instructor dueño; no en revisión. JPG, PNG o WebP de hasta 2 097 152 bytes. Responde { url_subida, ruta }: haz PUT del archivo a la url_subida (con el prefijo /almacen del front, o directo a Kong sin él) y llama a confirmar_portada.",
     (201, {"url_subida": "/almacen/object/upload/sign/portadas/cursos/1/portada-0123456789abcdef0123456789abcdef.png?token=<firma>", "ruta": "cursos/1/portada-0123456789abcdef0123456789abcdef.png"}),
     (422, "PORTADA_INVALIDA", "La portada debe ser una imagen JPG, PNG o WebP de hasta 2 MB.")),
    ("Videos", "Firma de video", "/api/v1/videos/firmas", False, {"clase_id": "{{clase_id}}", "nombre_archivo": "clase.mp4", "tipo_contenido": "video/mp4", "tamano_bytes": 25000000},
     "Dueño o equipo de apoyo; no en revisión. MP4, MOV o WebM de 1 a 1 073 741 824 bytes. Responde { video_id, url_subida, ruta }: haz PUT del archivo a la url_subida con el mismo Content-Type y llama a confirmar_subida_video. 409 VIDEO_EN_PROCESO si la clase ya tiene un video subiéndose.",
     (201, {"video_id": 1, "url_subida": "/almacen/object/upload/sign/videos/cursos/1/secciones/1/clases/1/1/original.mp4?token=<firma>", "ruta": "cursos/1/secciones/1/clases/1/1/original.mp4"}),
     (409, "VIDEO_EN_PROCESO", "Esta clase ya tiene un video subiéndose o procesándose.")),
    ("Videos", "Webhook interno del transcodificador", "/api/v1/interno/video-procesado", True, {"video_id": "{{video_id}}", "resultado": "listo", "duracion_segundos": 240},
     "Solo lo llama el transcodificador (red interna). Sin Authorization: exige la cabecera X-Secreto-Transcodificador (variable de entorno secreto_transcodificador, vacía en el repo); sin ella o con otra, 403 SIN_PERMISO. resultado: listo | error (con mensaje). Solo aplica a videos en_cola o procesando: si no, 200 { aplicado: false }.",
     (200, {"aplicado": True}),
     (403, "SIN_PERMISO", "No tienes permiso para hacer esto.")),
]

CARPETAS = ["Roles y administración", "Categorías", "Cursos", "Temario", "Catálogo", "Revisión", "Portadas", "Equipo", "Videos"]
DESCRIPCIONES = {
    "Roles y administración": "yo, mis_roles y las operaciones del administrador sobre cuentas y roles (módulos roles y users-admin).",
    "Categorías": "Categorías del catálogo (módulo categories). `categorias` es pública.",
    "Cursos": "Cursos del instructor (módulo courses).",
    "Temario": "Secciones y clases (módulo syllabus).",
    "Catálogo": "Catálogo público, sin token (módulo catalog).",
    "Revisión": "Envío a revisión y moderación (módulo review).",
    "Portadas": "Firma REST de la portada y su confirmación en GraphQL (módulo covers).",
    "Equipo": "Equipo de apoyo e invitaciones (módulos team y mail).",
    "Videos": "Firma REST del video, estado, reintento, borrado y webhook interno (módulo videos).",
}


def uid(texto):
    return str(uuid.uuid5(NS, texto))


def url(ruta):
    return {"raw": "{{base_url}}" + ruta, "host": ["{{base_url}}"], "path": ruta.strip("/").split("/")}


def j(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2)


def sin_comillas_variables(texto):
    # Los ids son números: "{{curso_id}}" -> {{curso_id}} para que el cuerpo sea JSON tras sustituir. Las variables de texto
    # (correo, slug, ruta) conservan sus comillas.
    return re.sub(r'"\{\{((?:curso|seccion|clase|video|invitacion|categoria)_id|id)\}\}"', r"{{\1}}", texto)


def cabeceras(sesion, secreto=False):
    h = []
    if sesion:
        h.append({"key": "Authorization", "value": TOKEN})
    if secreto:
        h.append({"key": "X-Secreto-Transcodificador", "value": "{{secreto_transcodificador}}"})
    h.append({"key": "Content-Type", "value": "application/json"})
    return h


def peticion(nombre, ruta, sesion, cuerpo_raw, descripcion, ejemplos, secreto=False):
    req = {"method": "POST", "header": cabeceras(sesion, secreto), "url": url(ruta), "description": descripcion,
           "body": {"mode": "raw", "raw": cuerpo_raw, "options": {"raw": {"language": "json"}}}}
    respuestas = []
    for titulo, estado, texto, cuerpo in ejemplos:
        respuestas.append({"name": titulo, "originalRequest": req, "status": texto, "code": estado,
                           "_postman_previewlanguage": "json", "header": [{"key": "Content-Type", "value": "application/json; charset=utf-8"}],
                           "body": j(cuerpo)})
    return {"id": uid(nombre + ruta + cuerpo_raw[:60]), "name": nombre, "request": req, "response": respuestas}


def error_gql(codigo, mensaje, campo):
    return {"data": None, "errors": [{"message": mensaje, "locations": [{"line": 1, "column": 1}], "path": [campo], "extensions": {"codigo": codigo}}]}


def cuerpo_hash(op, variables):
    clave, _, _ = OPERACIONES[op]
    cuerpo = {"operationName": op, "variables": variables,
              "extensions": {"persistedQuery": {"version": 1, "sha256Hash": clave.split(":", 1)[1]}}}
    return sin_comillas_variables(j(cuerpo))


def cuerpo_texto(op, variables):
    return sin_comillas_variables(j({"operationName": op, "query": OPERACIONES[op][1], "variables": variables}))


def peticion_gql(carpeta, op, sesion, variables, descripcion, ok, error, completa):
    campo = op
    cuerpo = cuerpo_texto(op, variables) if completa else cuerpo_hash(op, variables)
    if completa:
        desc = f"Solo desarrollo (NODE_ENV distinto de production): envía el texto completo de la consulta. En producción da 400 CONSULTA_NO_PERMITIDA. {descripcion}"
        nombre = f"{op} (consulta completa)"
    else:
        desc = f"{OPERACIONES[op][2].capitalize()} `{op}` por hash persistido (sha256 del manifiesto api/graphql/persisted-queries.json). {descripcion}"
        nombre = op
    ejemplos = [("200 Correcta", 200, "OK", {"data": ok}),
                (f"200 Error {error[0]}", 200, "OK", error_gql(error[0], error[1], campo))]
    return peticion(nombre, "/api/graphql", sesion, cuerpo, desc, ejemplos)


def peticion_rest(carpeta, nombre, ruta, secreto, cuerpo, descripcion, ok, error):
    texto_estado = {200: "OK", 201: "Created", 403: "Forbidden", 409: "Conflict", 422: "Unprocessable Entity"}
    ejemplos = [(f"{ok[0]} Correcta", ok[0], texto_estado[ok[0]], ok[1]),
                (f"{error[0]} {error[1]}", error[0], texto_estado[error[0]], {"error": {"codigo": error[1], "mensaje": error[2]}})]
    desc = f"POST {ruta}. {descripcion}"
    return peticion(nombre, ruta, not secreto, sin_comillas_variables(j(cuerpo)), desc, ejemplos, secreto)


def construir():
    carpetas = {c: [] for c in CARPETAS}
    for carpeta, op, sesion, variables, desc, ok, error in GQL:
        carpetas[carpeta].append(peticion_gql(carpeta, op, sesion, variables, desc, ok, error, False))
    for carpeta, nombre, ruta, secreto, cuerpo, desc, ok, error in REST:
        carpetas[carpeta].append(peticion_rest(carpeta, nombre, ruta, secreto, cuerpo, desc, ok, error))
    items = [{"id": uid("carpeta" + c), "name": c, "description": DESCRIPCIONES[c], "item": carpetas[c]} for c in CARPETAS]
    completas = [peticion_gql(c, op, s, v, d, ok, er, True) for c, op, s, v, d, ok, er in GQL]
    items.append({"id": uid("carpeta-completa"), "name": "Desarrollo: consulta completa",
                  "description": "Las mismas 33 operaciones con el texto completo de la consulta en lugar del hash. Solo funcionan con la API en desarrollo (npm run start:dev); en producción, 400 CONSULTA_NO_PERMITIDA.",
                  "item": completas})
    return {"info": {"_postman_id": uid("coleccion"), "name": "Medical School - Escuela",
                     "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                     "description": "Escuela de la plataforma (SPEC 10): operaciones de GraphQL en POST {{base_url}}/api/graphql (por hash persistido, como el front) y las tres rutas REST de los bordes (firma de portada, firma de video y webhook interno). Contrato completo en api/README.md. Inicia sesión primero con la colección Medical School API (guarda token_acceso en el entorno). Orden sugerido: crear_curso, guardar_seccion, guardar_clase, firma de portada, confirmar_portada, firma de video, confirmar_subida_video, estado_video, enviar_revision."},
            "item": items}


def comprobar(coleccion):
    # Las 33 operaciones del esquema (campos de Query y Mutation) deben estar todas en la colección y en el manifiesto
    campos = set()
    for bloque in re.findall(r"type (?:Query|Mutation) \{(.*?)\n\}", SCHEMA, re.S):
        campos |= set(re.findall(r"^  (\w+)[(:]", bloque, re.M))
    en_coleccion = {op for _, op, *_ in GQL}
    assert len(en_coleccion) == len(GQL) == 33, len(GQL)
    assert campos == en_coleccion == set(OPERACIONES), (campos ^ en_coleccion, en_coleccion ^ set(OPERACIONES))


def entorno(ruta):
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    existentes = {v["key"] for v in datos["values"]}
    nuevas = [("correo_invitado", "invitado@example.com", "default"), ("usuario_id", "", "default"), ("categoria_id", "", "default"),
              ("curso_id", "", "default"), ("slug", "", "default"), ("seccion_id", "", "default"), ("clase_id", "", "default"),
              ("video_id", "", "default"), ("invitacion_id", "", "default"), ("ruta_portada", "", "default"),
              ("secreto_transcodificador", "", "secret")]
    for clave, valor, tipo in nuevas:
        if clave not in existentes:
            datos["values"].append({"key": clave, "value": valor, "type": tipo, "enabled": True})
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    coleccion = construir()
    comprobar(coleccion)
    (API / "postman" / "medical-school-school.postman_collection.json").write_text(json.dumps(coleccion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    entorno(API / "postman" / "local.postman_environment.json")
    print(f"{len(GQL)} operaciones de GraphQL x 2 (hash y consulta completa) y {len(REST)} rutas REST")


if __name__ == "__main__":
    main()
