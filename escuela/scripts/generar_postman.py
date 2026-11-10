#!/usr/bin/env python3
"""Genera la colección y el entorno de Postman de la escuela (SPEC 07) en escuela/postman/.

Uso, desde la raíz del repo:  python3 escuela/scripts/generar_postman.py
Comprueba que la colección cubra exactamente las rutas /escuela/* que permite Caddy. No lleva secretos.
"""
import json
import re
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RAIZ_UUID = uuid.UUID("5c0e1a00-0000-4000-8000-000000000007")
B = {"curso_id": "{{curso_id}}"}

# (carpeta, nombre del workflow, método, ruta, sesión, consulta, cuerpo, descripción)
ENDPOINTS = [
    ("Catalogo publico", "Categorias", "GET", "categorias", False, None, None, "Lista pública de categorías ordenadas por posición."),
    ("Catalogo publico", "Cursos", "GET", "cursos", False, {"q": "anatomia", "categoria": "", "nivel": "", "pagina": "1"}, None, "Catálogo de cursos publicados: búsqueda en español sin acentos, filtros y 12 por página. Responde { cursos, total, pagina, paginas }."),
    ("Catalogo publico", "Curso publico", "GET", "curso", False, {"slug": "{{slug}}"}, None, "Ficha pública con el temario (sin video). 404 si el curso no está publicado."),
    ("Usuarios y roles", "Mis roles", "GET", "mis-roles", True, None, None, "Roles extra del usuario (el estudiante es implícito) y equipos de apoyo a los que pertenece."),
    ("Usuarios y roles", "Buscar usuario", "GET", "admin/buscar-usuario", True, {"correo": "{{correo_invitado}}"}, None, "Solo administrador. Busca una cuenta por su correo exacto y devuelve sus roles."),
    ("Usuarios y roles", "Asignar rol", "POST", "admin/asignar-rol", True, None, {"usuario_id": "{{usuario_id}}", "rol": "instructor", "activo": True}, "Solo administrador. rol: instructor o administrador. Un administrador no puede quitarse su propio rol."),
    ("Categorias (administrador)", "Guardar categoria", "POST", "admin/guardar-categoria", True, None, {"nombre": "Anatomía", "posicion": 10}, "Solo administrador. Sin id crea; con id edita. Nombre repetido: 409 CATEGORIA_DUPLICADA."),
    ("Categorias (administrador)", "Borrar categoria", "POST", "admin/borrar-categoria", True, None, {"id": 1}, "Solo administrador. 204; con cursos asignados: 409 CATEGORIA_EN_USO."),
    ("Cursos del instructor", "Mis cursos", "GET", "mis-cursos", True, None, None, "Instructor o equipo de apoyo. Cursos propios y de los instructores a los que se apoya, en cualquier estado."),
    ("Cursos del instructor", "Curso para edicion", "GET", "curso-edicion", True, {"id": "{{curso_id}}"}, None, "Dueño o equipo de apoyo. Curso completo con temario, estado y comentario de la revisión."),
    ("Cursos del instructor", "Crear curso", "POST", "crear-curso", True, None, {"titulo": "Anatomía básica"}, "Solo instructor. Crea un borrador y un slug único. 201 { id, slug }."),
    ("Cursos del instructor", "Editar curso", "POST", "editar-curso", True, None, {**B, "subtitulo": "Huesos y músculos", "nivel": "basico", "lo_que_aprenderas": ["Nombrar los huesos"]}, "Solo el instructor dueño; no en revisión. Solo cambia los campos enviados; \"\" o null vacía un campo opcional."),
    ("Temario", "Guardar seccion", "POST", "guardar-seccion", True, None, {**B, "titulo": "Introducción"}, "Dueño o equipo de apoyo; no en revisión. Con seccion_id renombra, sin él crea al final."),
    ("Temario", "Borrar seccion", "POST", "borrar-seccion", True, None, {"seccion_id": "{{seccion_id}}"}, "Dueño o equipo de apoyo. 204; renumera las demás."),
    ("Temario", "Guardar clase", "POST", "guardar-clase", True, None, {"seccion_id": "{{seccion_id}}", "titulo": "Bienvenida", "descripcion": "Presentación del curso", "duracion_estimada_minutos": 4, "es_muestra": True}, "Dueño o equipo de apoyo. Con clase_id edita, sin él crea al final. Aún sin video (SPEC 08)."),
    ("Temario", "Borrar clase", "POST", "borrar-clase", True, None, {"clase_id": "{{clase_id}}"}, "Dueño o equipo de apoyo. 204; renumera las demás."),
    ("Temario", "Mover", "POST", "mover", True, None, {"tipo": "clase", "id": "{{clase_id}}", "direccion": "subir"}, "Dueño o equipo de apoyo. Sube o baja una sección o una clase (tipo: seccion | clase)."),
    ("Revision", "Enviar a revision", "POST", "enviar-revision", True, None, B, "Solo el instructor dueño. 422 CURSO_INCOMPLETO con la lista de lo que falta."),
    ("Revision", "Cursos en revision", "GET", "admin/cursos-en-revision", True, None, None, "Solo administrador. Cursos pendientes con su temario."),
    ("Revision", "Resolver revision", "POST", "admin/resolver-revision", True, None, {**B, "aprobar": False, "comentario": "Falta la descripción de la primera clase."}, "Solo administrador. Aprobar publica el curso; devolverlo exige comentario."),
    ("Revision", "Retirar curso", "POST", "admin/retirar-curso", True, None, {**B, "comentario": "Contenido desactualizado."}, "Solo administrador. Un curso publicado vuelve a borrador con un comentario."),
    ("Portada", "URL de subida de portada", "POST", "url-subida-portada", True, None, {**B, "tipo_contenido": "image/png", "tamano_bytes": 120000}, "Solo el instructor dueño. JPG, PNG o WebP de hasta 2 097 152 bytes. Responde { url_subida, ruta }: haz PUT del archivo a {{url_base_almacen}} + url_subida sin el prefijo /almacen."),
    ("Portada", "Confirmar portada", "POST", "confirmar-portada", True, None, {**B, "ruta": "{{ruta_portada}}"}, "Solo el instructor dueño. Comprueba el archivo en Storage, guarda la portada y borra la anterior."),
    ("Videos", "Solicitar subida de video", "POST", "solicitar-subida-video", True, None, {"clase_id": "{{clase_id}}", "nombre_archivo": "clase.mp4", "tipo_contenido": "video/mp4", "tamano_bytes": 25000000}, "Dueño o equipo de apoyo; no en revisión. MP4, MOV o WebM de hasta 1 073 741 824 bytes. Responde { video_id, url_subida, ruta }: haz PUT del archivo a {{url_base_almacen}} + url_subida sin el prefijo /almacen, con el mismo Content-Type."),
    ("Videos", "Confirmar subida de video", "POST", "confirmar-subida-video", True, None, {"video_id": "{{video_id}}"}, "Dueño o equipo de apoyo. Comprueba el archivo en Storage y encola el procesado: 202 { estado: 'en_cola' }."),
    ("Videos", "Estado del video", "GET", "estado-video", True, {"clase_id": "{{clase_id}}"}, None, "Dueño o equipo de apoyo. { vigente, nuevo }: el video que se sirve y el que se sube o procesa (o falló). Consúltalo cada pocos segundos."),
    ("Videos", "Reintentar video", "POST", "reintentar-video", True, None, {"video_id": "{{video_id}}"}, "Dueño o equipo de apoyo. Solo un video en error cuyo original se conservó."),
    ("Videos", "Borrar video", "POST", "borrar-video", True, None, {"clase_id": "{{clase_id}}"}, "Dueño o equipo de apoyo. Borra el video vigente y los que estén en proceso o con error, con sus archivos. 204."),
    ("Equipo de apoyo", "Invitar al equipo", "POST", "invitar-equipo", True, None, {"correo": "{{correo_invitado}}"}, "Solo instructor. La cuenta debe estar registrada y verificada; recibe un aviso por correo sin enlaces. Vence en 7 días."),
    ("Equipo de apoyo", "Mi equipo", "GET", "mi-equipo", True, None, None, "Solo instructor. Miembros e invitaciones pendientes vigentes."),
    ("Equipo de apoyo", "Cancelar invitacion", "POST", "cancelar-invitacion", True, None, {"invitacion_id": "{{invitacion_id}}"}, "Solo instructor. 204."),
    ("Equipo de apoyo", "Quitar miembro", "POST", "quitar-miembro", True, None, {"miembro_id": "{{usuario_id}}"}, "Solo instructor. 204; si no está en otro equipo pierde el rol equipo_apoyo."),
    ("Equipo de apoyo", "Mis invitaciones", "GET", "mis-invitaciones", True, None, None, "Cualquier cuenta con sesión. Invitaciones pendientes y vigentes recibidas."),
    ("Equipo de apoyo", "Responder invitacion", "POST", "responder-invitacion", True, None, {"invitacion_id": "{{invitacion_id}}", "aceptar": True}, "La persona invitada acepta o rechaza. Aceptar da el rol equipo_apoyo."),
]


def uid(texto):
    return str(uuid.uuid5(RAIZ_UUID, texto))


def peticion(carpeta, nombre, metodo, ruta, sesion, consulta, cuerpo, descripcion):
    cabeceras = []
    if sesion:
        cabeceras.append({"key": "Authorization", "value": "Bearer {{token_acceso}}"})
    if cuerpo is not None:
        cabeceras.append({"key": "Content-Type", "value": "application/json"})
    url = {"raw": "{{url_base}}/escuela/" + ruta, "host": ["{{url_base}}"], "path": ["escuela"] + ruta.split("/")}
    if consulta:
        url["query"] = [{"key": k, "value": v, "disabled": v == ""} for k, v in consulta.items()]
        url["raw"] += "?" + "&".join(f"{k}={v}" for k, v in consulta.items() if v != "")
    item = {"id": uid(carpeta + nombre), "name": nombre, "request": {"method": metodo, "header": cabeceras, "url": url,
            "description": f"{metodo} /escuela/{ruta}. {descripcion}"}}
    if cuerpo is not None:
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(cuerpo, ensure_ascii=False, indent=2).replace('"{{', '"{{'),
                                   "options": {"raw": {"language": "json"}}}
    return item


def comprobar_contra_caddy():
    caddy = (RAIZ.parent / "auth" / "proxy" / "Caddyfile").read_text(encoding="utf-8")
    rutas_caddy = set(re.findall(r"/escuela/[a-z/-]+", caddy))
    rutas_coleccion = {"/escuela/" + e[3] for e in ENDPOINTS}
    assert rutas_caddy == rutas_coleccion, f"Caddy y Postman no coinciden: {rutas_caddy ^ rutas_coleccion}"


def main():
    comprobar_contra_caddy()
    carpetas = {}
    for e in ENDPOINTS:
        carpetas.setdefault(e[0], []).append(peticion(*e))
    coleccion = {
        "info": {"_postman_id": uid("coleccion"), "name": "Medical School - Escuela",
                 "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                 "description": "API de la escuela (SPEC 07): roles, cursos, temario, revisión, portadas, catálogo y equipos de apoyo. Entra por Caddy en {{url_base}}. "
                                "Inicia sesión con la colección de autenticación y pega el token_acceso. Contrato completo en escuela/README.md."},
        "item": [{"id": uid("carpeta" + n), "name": n, "item": items} for n, items in carpetas.items()],
    }
    variables = {"url_base": "http://127.0.0.1:8080", "url_base_almacen": "http://127.0.0.1:8000/storage/v1", "token_acceso": "", "slug": "anatomia-basica",
                 "curso_id": "1", "seccion_id": "1", "clase_id": "1", "invitacion_id": "1", "video_id": "1", "usuario_id": "", "correo_invitado": "invitado@example.com", "ruta_portada": ""}
    entorno = {"id": uid("entorno"), "name": "Local - Escuela", "_postman_variable_scope": "environment",
               "values": [{"key": k, "value": v, "type": "default", "enabled": True} for k, v in variables.items()]}
    destino = RAIZ / "postman"
    destino.mkdir(exist_ok=True)
    (destino / "escuela.postman_collection.json").write_text(json.dumps(coleccion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (destino / "local.postman_environment.json").write_text(json.dumps(entorno, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(ENDPOINTS)} peticiones en {len(carpetas)} carpetas.")


main()
