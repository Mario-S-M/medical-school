#!/usr/bin/env python3
"""Genera los workflows de n8n de la escuela (SPEC 07) en escuela/workflows/*.json.

Uso, desde la raíz del repo:  python3 escuela/scripts/generar_workflows.py
Cada workflow se define abajo con ayudantes pequeños; el JSON resultante es lo que se importa en n8n.

Reglas de diseño (pedidas por el usuario):
- Cada tramo de lógica es un grupo de nodos colapsable (nodeGroups) con una nota adhesiva que lo explica.
- Lo que se repite en varios workflows vive en un subworkflow y se llama con "Execute Workflow".
- Los workflows de roles van en la carpeta "Usuarios" y el resto en "Escuela" (subcarpetas de escuela/workflows/).
"""
import json
import uuid
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / "workflows"
RAIZ_UUID = uuid.UUID("5c0e1a00-0000-4000-8000-000000000007")
CRED_PROXY = {"httpHeaderAuth": {"id": "secretoProxy01", "name": "Secreto proxy"}}
CRED_PG = {"postgres": {"id": "pgSupabase01", "name": "Postgres n8n (Supabase)"}}
# Paleta de notas: un color por tipo de contenido
NOTA_GENERAL, NOTA_ENTRADA, NOTA_PERMISOS, NOTA_DATOS, NOTA_RESPUESTA = 7, 4, 3, 6, 5
ERROR_SESION = "{ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token de acceso falta, no es válido o expiró.' } }"


def uid(flujo, nombre):
    return str(uuid.uuid5(RAIZ_UUID, f"{flujo}/{nombre}"))


class Flujo:
    def __init__(self, id_, nombre, descripcion, carpeta, tiempo=15):
        self.id, self.nombre, self.descripcion, self.carpeta, self.tiempo = id_, nombre, descripcion, carpeta, tiempo
        self.nodos, self.conexiones, self.grupos, self.notas, self.posicion = [], {}, [], [], {}

    def nodo(self, nombre, tipo, version, parametros, x, y, **extra):
        x = x * 5 // 4  # separación horizontal de 300 px entre nodos, para que quepan las notas
        n = {"parameters": parametros, "id": uid(self.id, nombre), "name": nombre, "type": tipo,
             "typeVersion": version, "position": [x, y]}
        n.update(extra)
        self.nodos.append(n)
        self.posicion[nombre] = (x, y)
        return nombre

    def seccion(self, titulo, texto, color, nombres, agrupar=False, resumen=None):
        """Nota adhesiva que rodea a los nodos indicados y, si agrupar, un grupo de nodos colapsable con ellos."""
        xs = [self.posicion[n][0] for n in nombres]
        ys = [self.posicion[n][1] for n in nombres]
        x, y = min(xs) - 40, min(ys) - 170
        ancho, alto = max(xs) - min(xs) + 100 + 80, max(ys) - min(ys) + 100 + 170 + 70
        if ancho < 240:  # una nota de un solo nodo se ensancha hacia ambos lados para que el texto quepa
            x, ancho = x - (240 - ancho) // 2, 240
        self.nota(titulo, texto, color, x, y, ancho, alto)
        if agrupar:
            ids = [uid(self.id, n) for n in nombres]
            self.grupos.append({"id": uid(self.id, "grupo-" + titulo), "name": titulo, "nodeIds": ids,
                                **({"description": resumen[:150]} if resumen else {})})

    def nota(self, titulo, texto, color, x, y, ancho, alto):
        contenido = f"### {titulo}\n{texto}"
        self.notas.append({"parameters": {"content": contenido, "height": alto, "width": ancho, "color": color},
                           "id": uid(self.id, "nota-" + titulo), "name": "Nota " + titulo,
                           "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [x, y]})

    def unir(self, origen, destino, salida=0):
        casillas = self.conexiones.setdefault(origen, {"main": []})["main"]
        while len(casillas) <= salida:
            casillas.append([])
        casillas[salida].append({"node": destino, "type": "main", "index": 0})

    # --- ayudantes por tipo de nodo ---
    def webhook(self, metodo, ruta, x=0, y=0):
        return self.nodo("Recibir solicitud", "n8n-nodes-base.webhook", 2.1,
                         {"httpMethod": metodo, "path": ruta, "authentication": "headerAuth",
                          "responseMode": "responseNode", "options": {}}, x, y,
                         credentials=CRED_PROXY, webhookId=uid(self.id, "webhook"))

    def codigo(self, nombre, js, x, y):
        return self.nodo(nombre, "n8n-nodes-base.code", 2, {"jsCode": js}, x, y)

    def si(self, nombre, expresion, x, y):
        cond = {"id": uid(self.id, "cond-" + nombre), "leftValue": expresion, "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}
        return self.nodo(nombre, "n8n-nodes-base.if", 2.2,
                         {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                                         "conditions": [cond], "combinator": "and"}, "options": {}}, x, y)

    def sql(self, nombre, consulta, parametros, x, y):
        return self.nodo(nombre, "n8n-nodes-base.postgres", 2.5,
                         {"operation": "executeQuery", "query": consulta,
                          "options": {"queryReplacement": parametros}}, x, y,
                         credentials=CRED_PG, onError="continueRegularOutput", alwaysOutputData=True)

    def http(self, nombre, metodo, url, cabeceras, x, y, cuerpo=None):
        p = {"method": metodo, "url": url, "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "json"}}},
             "sendHeaders": True, "specifyHeaders": "keypair",
             "headerParameters": {"parameters": [{"name": k, "value": v} for k, v in cabeceras.items()]}}
        return self.nodo(nombre, "n8n-nodes-base.httpRequest", 4.2, p, x, y, onError="continueRegularOutput")

    def validar(self, x, y):
        return self.nodo("Validar sesion y roles", "n8n-nodes-base.executeWorkflow", 1.2,
                         {"workflowId": {"__rl": True, "value": "escValidar01", "mode": "id"}, "options": {"waitForSubWorkflow": True}}, x, y)

    def responder(self, x, y):
        return self.nodo("Responder", "n8n-nodes-base.respondToWebhook", 1.5,
                         {"respondWith": "text", "responseBody": "={{ JSON.stringify($json.cuerpo) }}",
                          "options": {"responseCode": "={{ $json.estado }}", "responseHeaders": {"entries": [
                              {"name": "Content-Type", "value": "application/json; charset=utf-8"},
                              {"name": "X-Flujo", "value": "escuela"}]}}}, x, y)

    def guardar(self, activo=False):
        d = {"id": self.id, "name": self.nombre, "description": self.descripcion, "active": False, "isArchived": False,
             "settings": {"executionOrder": "v1", "saveDataErrorExecution": "none", "saveDataSuccessExecution": "none",
                          "saveManualExecutions": False, "saveExecutionProgress": False, "executionTimeout": self.tiempo},
             "nodes": self.notas + self.nodos, "connections": self.conexiones, "nodeGroups": self.grupos,
             "pinData": {}, "meta": None, "tags": []}
        (SALIDA / self.carpeta).mkdir(parents=True, exist_ok=True)
        archivo = SALIDA / self.carpeta / (self.nombre.lower().replace(" ", "-") + ".json")
        archivo.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validar_sesion_y_roles():
    f = Flujo("escValidar01", "Validar sesion y roles",
              "Subworkflow. Recibe la solicitud del webhook (con la cabecera Authorization), valida el token contra Supabase Auth "
              "(auth:9999/user) y devuelve { ok, usuario, roles, equipos } o { ok: false, estado, cuerpo }. Lo llaman todos los workflows protegidos de la escuela.",
              "usuarios")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.codigo("Extraer token", f"""const cabecera = String(($input.first().json.headers || {{}})['authorization'] || '');
const coincide = /^Bearer ([A-Za-z0-9_-]{{10,2048}}\\.[A-Za-z0-9_-]{{10,2048}}\\.[A-Za-z0-9_-]{{10,2048}})$/.exec(cabecera);
if (!coincide) return [{{ json: {{ ok: false, estado: 401, cuerpo: {ERROR_SESION} }} }}];
return [{{ json: {{ ok: true, autorizacion: `Bearer ${{coincide[1]}}` }} }}];""", 240, 0)
    f.si("Hay token", "={{ $json.ok }}", 480, 0)
    f.http("Consultar usuario en Supabase Auth", "GET", "http://auth:9999/user", {"Authorization": "={{ $json.autorizacion }}"}, 720, -100)
    f.codigo("Clasificar respuesta", f"""const r = $input.first().json;
const gt = r.body && typeof r.body === 'object' ? r.body : {{}};
if (r.statusCode === 200 && gt.id) {{
  return [{{ json: {{ ok: true, usuario: {{ id: gt.id, correo: gt.email, nombre: (gt.user_metadata || {{}}).nombre ?? null }} }} }}];
}}
if ([400, 401, 403, 404].includes(r.statusCode)) return [{{ json: {{ ok: false, estado: 401, cuerpo: {ERROR_SESION} }} }}];
if (r.statusCode === 429) return [{{ json: {{ ok: false, estado: 429, cuerpo: {{ error: {{ codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiadas solicitudes. Inténtalo más tarde.' }} }} }} }}];
return [{{ json: {{ ok: false, estado: 500, cuerpo: {{ error: {{ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' }} }} }} }}];""", 960, -100)
    f.si("Sesion valida", "={{ $json.ok }}", 1200, -100)
    f.sql("Consultar roles y equipos", """SELECT
  coalesce((SELECT array_agg(rol ORDER BY rol) FROM escuela.roles_usuario WHERE usuario_id = $1::uuid), '{}') AS roles,
  coalesce((SELECT json_agg(json_build_object('instructor_id', e.instructor_id, 'nombre_publico', p.nombre_publico) ORDER BY e.creado_en)
            FROM escuela.equipos_apoyo e LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = e.instructor_id
            WHERE e.miembro_id = $1::uuid), '[]'::json) AS equipos;""", "={{ [$json.usuario.id] }}", 1440, -200)
    f.codigo("Armar contexto", """const fila = $input.first().json;
if (!Array.isArray(fila.roles)) return [{ json: { ok: false, estado: 500, cuerpo: { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' } } } }];
return [{ json: { ok: true, usuario: $('Clasificar respuesta').first().json.usuario, roles: fila.roles, equipos: fila.equipos || [] } }];""", 1680, -200)
    f.nodo("Devolver error", "n8n-nodes-base.noOp", 1, {}, 1440, 200)
    f.unir("Disparador", "Extraer token"); f.unir("Extraer token", "Hay token")
    f.unir("Hay token", "Consultar usuario en Supabase Auth", 0); f.unir("Hay token", "Devolver error", 1)
    f.unir("Consultar usuario en Supabase Auth", "Clasificar respuesta"); f.unir("Clasificar respuesta", "Sesion valida")
    f.unir("Sesion valida", "Consultar roles y equipos", 0); f.unir("Sesion valida", "Devolver error", 1)
    f.unir("Consultar roles y equipos", "Armar contexto")
    f.nota("Validar sesion y roles", "Subworkflow compartido: **ningún workflow protegido repite esta lógica**, todos lo llaman con *Execute Workflow* y le pasan la solicitud del webhook.\n\nSalida: `{ ok, usuario, roles, equipos }` o `{ ok: false, estado, cuerpo }`.", NOTA_GENERAL, 0, -640, 1000, 200)
    f.seccion("Entrada", "Recibe la solicitud del webhook que lo llamó.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Leer token", "Saca el `Bearer` de la cabecera `Authorization`. Si falta o está mal formado, responde `401`.", NOTA_ENTRADA,
              ["Extraer token", "Hay token"], True, "Extrae el token de la cabecera Authorization y corta con 401 si no es válido.")
    f.seccion("Consultar Supabase Auth", "Pregunta a `auth:9999/user` quién es el dueño del token. Un token vencido o falso da `401`.", NOTA_PERMISOS,
              ["Consultar usuario en Supabase Auth", "Clasificar respuesta", "Sesion valida"], True, "Valida el token contra Supabase Auth y traduce su respuesta.")
    f.seccion("Cargar roles y equipos", "Lee en `escuela` los roles extra (el estudiante es implícito) y los equipos de apoyo del usuario.", NOTA_DATOS,
              ["Consultar roles y equipos", "Armar contexto"], True, "Lee los roles y equipos del usuario en el esquema escuela.")
    f.seccion("Salida con error", "Cualquier fallo termina aquí y se devuelve tal cual al workflow que llamó.", NOTA_RESPUESTA, ["Devolver error"])
    f.guardar()


def mis_roles():
    f = Flujo("escMisRoles01", "Mis roles", "GET /escuela/mis-roles. Devuelve los roles extra del usuario (el estudiante es implícito) y los equipos de apoyo a los que pertenece. No guarda ejecuciones.", "usuarios")
    f.webhook("GET", "escuela/mis-roles")
    f.validar(240, 0)
    f.si("Sesion valida", "={{ $json.ok }}", 480, 0)
    f.codigo("Armar respuesta", """const c = $input.first().json;
const equipos = c.equipos.map(e => ({ instructor_id: e.instructor_id, nombre_publico: e.nombre_publico }));
return [{ json: { estado: 200, cuerpo: { roles: c.roles, equipos } } }];""", 720, -100)
    f.responder(960, 0)
    f.unir("Recibir solicitud", "Validar sesion y roles")
    f.unir("Validar sesion y roles", "Sesion valida")
    f.unir("Sesion valida", "Armar respuesta", 0); f.unir("Sesion valida", "Responder", 1)
    f.unir("Armar respuesta", "Responder")
    f.nota("Mis roles", "`GET /escuela/mis-roles` · requiere sesión.\n\nDevuelve `{ roles, equipos }`. El estudiante es implícito: un usuario nuevo recibe `roles: []`. El menú de la cabecera del front lo usa para mostrar los enlaces *Instructor* y *Admin*.", NOTA_GENERAL, 0, -520, 1000, 200)
    f.seccion("Entrada", "Webhook protegido por el secreto del proxy (Caddy es la única entrada).", NOTA_ENTRADA, ["Recibir solicitud"])
    f.seccion("Comprobar sesion", "Llama al subworkflow `Validar sesion y roles`. Si la sesión no vale, su error pasa directo a *Responder*.", NOTA_PERMISOS,
              ["Validar sesion y roles", "Sesion valida"], True, "Valida el token y carga roles y equipos con el subworkflow compartido.")
    f.seccion("Respuesta", "Da forma al `200` o devuelve el error de la sesión.", NOTA_RESPUESTA, ["Armar respuesta", "Responder"])
    f.guardar()


if __name__ == "__main__":
    validar_sesion_y_roles()
    mis_roles()
