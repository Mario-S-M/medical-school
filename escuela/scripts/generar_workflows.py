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
# (el rojo se reserva para errores)
NOTA_GENERAL, NOTA_ENTRADA, NOTA_PERMISOS, NOTA_DATOS, NOTA_RESPUESTA, NOTA_ERROR = 7, 4, 1, 6, 5, 3
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
        # el texto queda por encima del marco del grupo: al colapsarse, su tarjeta tapa lo que haya dentro del marco
        x, y = min(xs) - 40, min(ys) - 260
        ancho, alto = max(xs) - min(xs) + 100 + 80, max(ys) - min(ys) + 100 + 260 + 70
        if ancho < 240:  # una nota de un solo nodo se ensancha hacia ambos lados para que el texto quepa
            x, ancho = x - (240 - ancho) // 2, 240
        self.nota(titulo, texto, color, x, y, ancho, alto)
        if agrupar:
            ids = [uid(self.id, n) for n in nombres]
            self.grupos.append({"id": uid(self.id, "grupo-" + titulo), "name": titulo, "nodeIds": ids,
                                **({"description": resumen[:150]} if resumen else {})})

    def general(self, titulo, texto, ancho=1000, alto=150):
        """Nota general del workflow: se coloca sola, encima de todas las demás."""
        arriba = min(n["position"][1] for n in self.notas)
        self.nota(titulo, texto, NOTA_GENERAL, 0, arriba - alto - 40, ancho, alto)

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

    def http(self, nombre, metodo, url, cabeceras, x, y, servicio=False):
        p = {"method": metodo, "url": url, "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": "json"}}},
             "sendHeaders": True, "specifyHeaders": "keypair",
             "headerParameters": {"parameters": [{"name": k, "value": v} for k, v in cabeceras.items()]}}
        extra = {}
        if servicio:  # credencial con la clave del rol de servicio de Supabase (Authorization: Bearer ...)
            p.update({"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"})
            p.pop("sendHeaders"); p.pop("specifyHeaders"); p.pop("headerParameters")
            extra["credentials"] = {"httpHeaderAuth": {"id": "supabaseServicio01", "name": "Supabase rol de servicio"}}
        return self.nodo(nombre, "n8n-nodes-base.httpRequest", 4.2, p, x, y, onError="continueRegularOutput", **extra)

    def subflujo(self, nombre, id_destino, x, y):
        """Llama a otro workflow (subworkflow) con Execute Workflow, pasándole el item actual."""
        return self.nodo(nombre, "n8n-nodes-base.executeWorkflow", 1.2,
                         {"workflowId": {"__rl": True, "value": id_destino, "mode": "id"}, "options": {"waitForSubWorkflow": True}}, x, y)

    def validar(self, x, y):
        return self.nodo("Validar sesion y roles", "n8n-nodes-base.executeWorkflow", 1.2,
                         {"workflowId": {"__rl": True, "value": "escValidar01", "mode": "id"}, "options": {"waitForSubWorkflow": True}}, x, y)

    def responder(self, x, y):
        return self.nodo("Responder", "n8n-nodes-base.respondToWebhook", 1.5,
                         {"respondWith": "text", "responseBody": "={{ $json.cuerpo === null ? '' : JSON.stringify($json.cuerpo) }}",
                          "options": {"responseCode": "={{ $json.estado }}", "responseHeaders": {"entries": [
                              {"name": "Content-Type", "value": "application/json; charset=utf-8"},
                              {"name": "X-Flujo", "value": "escuela"}]}}}, x, y)

    def guardar(self, activo=False):
        d = {"id": self.id, "name": self.nombre, "description": self.descripcion, "active": False, "isArchived": False,
             "settings": {"executionOrder": "v1", "saveDataErrorExecution": "none", "saveDataSuccessExecution": "none",
                          "saveManualExecutions": False, "saveExecutionProgress": False, "executionTimeout": self.tiempo},
             "nodes": self.notas + self.nodos, "connections": self.conexiones, "nodeGroups": self.grupos,
             "pinData": {}, "meta": None, "tags": []}
        nombres = [n["name"] for n in d["nodes"]]
        assert len(nombres) == len(set(nombres)), f"{self.nombre}: nombres de nodo repetidos (¿dos notas con el mismo título?)"
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
    f.nodo("Devolver error", "n8n-nodes-base.noOp", 1, {}, 1440, 300)
    f.unir("Disparador", "Extraer token"); f.unir("Extraer token", "Hay token")
    f.unir("Hay token", "Consultar usuario en Supabase Auth", 0); f.unir("Hay token", "Devolver error", 1)
    f.unir("Consultar usuario en Supabase Auth", "Clasificar respuesta"); f.unir("Clasificar respuesta", "Sesion valida")
    f.unir("Sesion valida", "Consultar roles y equipos", 0); f.unir("Sesion valida", "Devolver error", 1)
    f.unir("Consultar roles y equipos", "Armar contexto")
    f.seccion("Entrada", "Recibe la solicitud del webhook que lo llamó.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Leer token", "Saca el `Bearer` de la cabecera `Authorization`. Si falta o está mal formado, responde `401`.", NOTA_ENTRADA,
              ["Extraer token", "Hay token"], True, "Extrae el token de la cabecera Authorization y corta con 401 si no es válido.")
    f.seccion("Consultar Supabase Auth", "Pregunta a `auth:9999/user` quién es el dueño del token. Un token vencido o falso da `401`.", NOTA_PERMISOS,
              ["Consultar usuario en Supabase Auth", "Clasificar respuesta", "Sesion valida"], True, "Valida el token contra Supabase Auth y traduce su respuesta.")
    f.seccion("Cargar roles y equipos", "Lee en `escuela` los roles extra (el estudiante es implícito) y los equipos de apoyo del usuario.", NOTA_DATOS,
              ["Consultar roles y equipos", "Armar contexto"], True, "Lee los roles y equipos del usuario en el esquema escuela.")
    f.seccion("Salida con error", "Cualquier fallo termina aquí y se devuelve tal cual al workflow que llamó.", NOTA_ERROR, ["Devolver error"])
    f.general("Validar sesion y roles", "Subworkflow compartido: **ningún workflow protegido repite esta lógica**, todos lo llaman con *Execute Workflow* y le pasan la solicitud del webhook.\n\nSalida: `{ ok, usuario, roles, equipos }` o `{ ok: false, estado, cuerpo }`.")
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
    f.seccion("Entrada", "Webhook protegido por el secreto del proxy (Caddy es la única entrada).", NOTA_ENTRADA, ["Recibir solicitud"])
    f.seccion("Comprobar sesion", "Llama al subworkflow `Validar sesion y roles`. Si la sesión no vale, su error pasa directo a *Responder*.", NOTA_PERMISOS,
              ["Validar sesion y roles", "Sesion valida"], True, "Valida el token y carga roles y equipos con el subworkflow compartido.")
    f.seccion("Respuesta", "Da forma al `200` o devuelve el error de la sesión.", NOTA_RESPUESTA, ["Armar respuesta", "Responder"])
    f.general("Mis roles", "`GET /escuela/mis-roles` · requiere sesión.\n\nDevuelve `{ roles, equipos }`. El estudiante es implícito: un usuario nuevo recibe `roles: []`. El menú de la cabecera del front lo usa para mostrar los enlaces *Instructor* y *Admin*.")
    f.guardar()


ERROR_INTERNO_JS = "{ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' } }"
ERROR_PERMISO_JS = "{ error: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' } }"


def exigir_rol():
    f = Flujo("escExigirRol01", "Exigir rol",
              "Subworkflow. Recibe la solicitud del webhook más rol_requerido, valida la sesión con Validar sesion y roles y comprueba que el usuario tenga ese rol. "
              "Devuelve el mismo item con { ok, usuario, roles, equipos } o { ok: false, estado: 401 o 403, cuerpo }.", "usuarios")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.subflujo("Validar sesion y roles", "escValidar01", 240, 0)
    f.si("Sesion valida", "={{ $json.ok }}", 480, 0)
    f.codigo("Comprobar rol", f"""const contexto = $input.first().json;
const original = $('Disparador').first().json;
if (!contexto.roles.includes(original.rol_requerido)) {{
  return [{{ json: {{ ok: false, estado: 403, cuerpo: {ERROR_PERMISO_JS} }} }}];
}}
return [{{ json: {{ ...original, ...contexto }} }}];""", 720, -100)
    f.nodo("Devolver error", "n8n-nodes-base.noOp", 1, {}, 720, 400)
    f.unir("Disparador", "Validar sesion y roles"); f.unir("Validar sesion y roles", "Sesion valida")
    f.unir("Sesion valida", "Comprobar rol", 0); f.unir("Sesion valida", "Devolver error", 1)
    f.seccion("Entrada", "Recibe la solicitud y el `rol_requerido`.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Comprobar sesion", "Reutiliza el subworkflow `Validar sesion y roles`.", NOTA_PERMISOS, ["Validar sesion y roles", "Sesion valida"], True,
              "Valida el token y carga los roles con el subworkflow compartido.")
    f.seccion("Comprobar rol", "Si el usuario no tiene el rol pedido, responde `403 SIN_PERMISO`.", NOTA_PERMISOS, ["Comprobar rol"])
    f.seccion("Salida con error", "Un error de sesión sale tal cual.", NOTA_ERROR, ["Devolver error"])
    f.general("Exigir rol", "Subworkflow compartido: **ningún endpoint protegido repite la comprobación de permisos**.\n\nEntrada: la solicitud del webhook y `rol_requerido` (`instructor`, `administrador`…). Salida: el mismo item con `usuario`, `roles` y `equipos`, o `{ ok: false, estado, cuerpo }`.")
    f.guardar()


JS_VALIDAR_CAMPOS = r"""const entrada = $input.first().json;
const datos = entrada.datos;
const reglas = entrada.reglas || {};
const detalles = [];
const falla = (campo, regla, mensaje) => detalles.push({ campo, regla, mensaje });
const respuesta = (mensaje) => [{ json: { ok: false, estado: 422, cuerpo: { error: { codigo: 'VALIDACION_FALLIDA', mensaje, detalles } } } }];
if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
  falla('cuerpo', 'objeto_requerido', 'Los datos deben ser un objeto JSON.');
  return respuesta('Revisa los datos enviados.');
}
for (const clave of Object.keys(datos)) if (!(clave in reglas)) falla(clave, 'campo_no_permitido', 'Este campo no está permitido.');
const limpio = {};
for (const [campo, r] of Object.entries(reglas)) {
  let v = datos[campo];
  if (v === undefined || v === null || v === '') {
    if (!r.opcional) falla(campo, 'obligatorio', 'Este campo es obligatorio.');
    limpio[campo] = null;
    continue;
  }
  if (r.tipo === 'texto') {
    if (typeof v !== 'string') { falla(campo, 'tipo_texto', 'Debe ser un texto.'); continue; }
    v = v.trim();
    if (!r.multilinea && /[\u0000-\u001f\u007f]/.test(v)) falla(campo, 'sin_caracteres_de_control', 'No puede tener caracteres de control.');
    if (r.minimo && v.length < r.minimo) falla(campo, 'minimo_caracteres', `Debe tener al menos ${r.minimo} caracteres.`);
    if (r.maximo && v.length > r.maximo) falla(campo, 'maximo_caracteres', `Debe tener como máximo ${r.maximo} caracteres.`);
    if (r.alfanumerico && !/[\p{L}\p{N}]/u.test(v)) falla(campo, 'requiere_letra_o_numero', 'Debe incluir al menos una letra o un número.');
  } else if (r.tipo === 'entero') {
    const n = typeof v === 'number' ? v : (/^-?\d{1,15}$/.test(String(v)) ? Number(v) : NaN);
    if (!Number.isInteger(n)) { falla(campo, 'tipo_entero', 'Debe ser un número entero.'); continue; }
    if (r.minimo !== undefined && n < r.minimo) falla(campo, 'valor_minimo', `Debe ser al menos ${r.minimo}.`);
    if (r.maximo !== undefined && n > r.maximo) falla(campo, 'valor_maximo', `Debe ser como máximo ${r.maximo}.`);
    v = n;
  } else if (r.tipo === 'booleano') {
    if (v === true || v === 'true') v = true;
    else if (v === false || v === 'false') v = false;
    else { falla(campo, 'tipo_booleano', 'Debe ser verdadero o falso.'); continue; }
  } else if (r.tipo === 'uuid') {
    if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) { falla(campo, 'formato_uuid', 'Debe ser un identificador válido.'); continue; }
    v = v.toLowerCase();
  } else if (r.tipo === 'correo') {
    if (typeof v !== 'string' || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) { falla(campo, 'formato_correo', 'Debe ser un correo válido.'); continue; }
    v = v.trim().toLowerCase();
  } else if (r.tipo === 'opcion') {
    if (!(r.valores || []).includes(v)) { falla(campo, 'valor_no_permitido', `Debe ser uno de: ${(r.valores || []).join(', ')}.`); continue; }
  }
  limpio[campo] = v;
}
if (detalles.length) return respuesta('Revisa los datos enviados.');
const { reglas: _reglas, datos: _datos, ...resto } = entrada;
return [{ json: { ...resto, ok: true, datos: limpio } }];"""


def validar_campos():
    f = Flujo("escValidarCampos01", "Validar campos",
              "Subworkflow. Recibe { datos, reglas } (reglas por campo: tipo texto, entero, booleano, uuid, correo u opcion, con minimo, maximo, opcional…) y devuelve el mismo item con datos normalizados "
              "o { ok: false, estado: 422, cuerpo } con VALIDACION_FALLIDA. Rechaza los campos que no estén en las reglas.", "escuela")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.codigo("Aplicar reglas", JS_VALIDAR_CAMPOS, 240, 0)
    f.unir("Disparador", "Aplicar reglas")
    f.seccion("Entrada", "Recibe `datos` (cuerpo o consulta del webhook) y las `reglas` de cada campo.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Aplicar reglas", "Rechaza campos extra y valida tipo, largo y rango. Normaliza (recorta textos, correos en minúscula, enteros reales) y devuelve todos los errores juntos.", NOTA_PERMISOS, ["Aplicar reglas"])
    f.general("Validar campos", "Subworkflow compartido: **ningún endpoint repite su validación de datos**, solo declara sus reglas.\n\nTipos: `texto`, `entero`, `booleano`, `uuid`, `correo`, `opcion`. Un campo vacío es un error salvo que la regla diga `opcional`.")
    f.guardar()


def protegido(f, metodo, ruta, rol, origen, reglas):
    """Entrada común de un endpoint: webhook, permiso por rol (si rol) y validación de campos (si reglas).
    Los errores de los dos pasos van directo a "Responder". Devuelve la columna libre siguiente."""
    f.webhook(metodo, ruta, 0, 0)
    anterior, x = "Recibir solicitud", 240
    f.seccion("Entrada", "Webhook protegido por el secreto del proxy (Caddy es la única entrada).", NOTA_ENTRADA, ["Recibir solicitud"])
    if rol:
        f.codigo("Definir reglas", f"""const e = $input.first().json;
return [{{ json: {{ headers: e.headers, rol_requerido: {json.dumps(rol)}, datos: e.{origen}, reglas: {json.dumps(reglas, ensure_ascii=False)} }} }}];""", x, 0)
        f.subflujo("Exigir rol", "escExigirRol01", x + 240, 0)
        f.si("Permiso valido", "={{ $json.ok }}", x + 480, 0)
        f.unir(anterior, "Definir reglas"); f.unir("Definir reglas", "Exigir rol"); f.unir("Exigir rol", "Permiso valido")
        f.unir("Permiso valido", "Responder", 1)
        f.seccion("Comprobar permiso", f"Exige el rol `{rol}` con el subworkflow `Exigir rol`. Sin sesión da `401`; sin el rol, `403`.", NOTA_PERMISOS,
                  ["Definir reglas", "Exigir rol", "Permiso valido"], True, f"Exige el rol {rol} con el subworkflow compartido.")
        anterior, x = "Permiso valido", x + 720
    else:
        f.codigo("Definir reglas", f"""const e = $input.first().json;
return [{{ json: {{ datos: e.{origen}, reglas: {json.dumps(reglas, ensure_ascii=False)} }} }}];""", x, 0)
        f.unir(anterior, "Definir reglas"); anterior, x = "Definir reglas", x + 240
    f.subflujo("Validar campos", "escValidarCampos01", x, 0)
    f.si("Entrada valida", "={{ $json.ok }}", x + 240, 0)
    f.unir(anterior, "Validar campos"); f.unir("Validar campos", "Entrada valida"); f.unir("Entrada valida", "Responder", 1)
    f.seccion("Validar entrada", "Subworkflow `Validar campos`: tipos, largos y campos extra. Si falla, `422 VALIDACION_FALLIDA` con la lista de reglas.", NOTA_ENTRADA,
              ["Validar campos", "Entrada valida"], True, "Valida y normaliza los campos con el subworkflow compartido.")
    return x + 480


def cierre(f, x, nombres_datos, titulo, texto, color=NOTA_DATOS, resumen=None):
    """Grupo de datos (consultas y armado de la respuesta) más el nodo Responder, con sus notas."""
    f.responder(x, 0)
    f.seccion(titulo, texto, color, nombres_datos, True, resumen or texto.split("\n")[0].replace("`", ""))
    f.seccion("Respuesta", "Devuelve el resultado o el error de cualquier paso anterior.", NOTA_RESPUESTA, ["Responder"])


def categorias():
    f = Flujo("escCategorias01", "Categorias", "GET /escuela/categorias. Lista pública de categorías ordenadas por posición. No guarda ejecuciones.", "escuela")
    f.webhook("GET", "escuela/categorias")
    f.seccion("Entrada", "Webhook público: no pide sesión.", NOTA_ENTRADA, ["Recibir solicitud"])
    f.sql("Consultar categorias", "SELECT coalesce(json_agg(json_build_object('id', id, 'nombre', nombre, 'slug', slug, 'posicion', posicion) ORDER BY posicion, nombre), '[]'::json) AS categorias FROM escuela.categorias;", "={{ [] }}", 240, 0)
    f.codigo("Armar respuesta", "return [{ json: { estado: 200, cuerpo: { categorias: $input.first().json.categorias } } }];", 480, 0)
    f.unir("Recibir solicitud", "Consultar categorias"); f.unir("Consultar categorias", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, 720, ["Consultar categorias", "Armar respuesta"], "Consultar categorias", "Lee `escuela.categorias` ordenadas por `posicion` y las devuelve como `{ categorias }`.")
    f.general("Categorias", "`GET /escuela/categorias` · público.\n\nAlimenta el menú de categorías de la cabecera y el filtro del catálogo.")
    f.guardar()


def guardar_categoria():
    f = Flujo("escGuardarCategoria01", "Guardar categoria", "POST /escuela/admin/guardar-categoria. Crea o edita una categoría (solo administrador). El slug se genera del nombre. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/admin/guardar-categoria", "administrador", "body", {
        "id": {"tipo": "entero", "opcional": True, "minimo": 1, "maximo": 32000},
        "nombre": {"tipo": "texto", "minimo": 2, "maximo": 60, "alfanumerico": True},
        "posicion": {"tipo": "entero", "minimo": 1, "maximo": 1000}})
    f.sql("Guardar en la base", """WITH datos AS (
  SELECT $1::int AS id, $2::text AS nombre, $3::int AS posicion,
         trim(both '-' from lower(regexp_replace(escuela.sin_acentos($2::text), '[^a-zA-Z0-9]+', '-', 'g'))) AS slug
), actualizada AS (
  UPDATE escuela.categorias c SET nombre = d.nombre, slug = d.slug, posicion = d.posicion FROM datos d
  WHERE c.id = d.id AND NOT EXISTS (SELECT 1 FROM escuela.categorias o WHERE o.id <> d.id AND (o.nombre = d.nombre OR o.slug = d.slug))
  RETURNING c.id
), insertada AS (
  INSERT INTO escuela.categorias (nombre, slug, posicion)
  SELECT nombre, slug, posicion FROM datos d
  WHERE d.id IS NULL AND NOT EXISTS (SELECT 1 FROM escuela.categorias o WHERE o.nombre = d.nombre OR o.slug = d.slug)
  RETURNING id
)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM actualizada) OR EXISTS (SELECT 1 FROM insertada) THEN 'ok'
  WHEN (SELECT id FROM datos) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM escuela.categorias WHERE id = (SELECT id FROM datos)) THEN 'no_encontrada'
  ELSE 'duplicada' END AS resultado,
  coalesce((SELECT id FROM actualizada), (SELECT id FROM insertada)) AS id;""",
          "={{ [$json.datos.id, $json.datos.nombre, $json.datos.posicion] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
if (r.resultado === 'ok') return [{{ json: {{ estado: 200, cuerpo: {{ id: r.id }} }} }}];
if (r.resultado === 'no_encontrada') return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe.' }} }} }} }}];
if (r.resultado === 'duplicada') return [{{ json: {{ estado: 409, cuerpo: {{ error: {{ codigo: 'CATEGORIA_DUPLICADA', mensaje: 'Ya existe una categoría con ese nombre.' }} }} }} }}];
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 240, 0)
    f.unir("Entrada valida", "Guardar en la base"); f.unir("Guardar en la base", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Guardar en la base", "Armar respuesta"], "Guardar en la base", "Una sola consulta crea (sin `id`) o edita (con `id`) y detecta nombres o slugs repetidos: `409 CATEGORIA_DUPLICADA`; un `id` inexistente da `404`.")
    f.general("Guardar categoria", "`POST /escuela/admin/guardar-categoria` · solo `administrador`.\n\nEntrada: `{ id?, nombre, posicion }`. El `slug` sale del nombre (minúsculas, sin acentos). Responde `200 { id }`.")
    f.guardar()


def borrar_categoria():
    f = Flujo("escBorrarCategoria01", "Borrar categoria", "POST /escuela/admin/borrar-categoria. Borra una categoría sin cursos (solo administrador). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/admin/borrar-categoria", "administrador", "body", {"id": {"tipo": "entero", "minimo": 1, "maximo": 32000}})
    f.sql("Borrar en la base", """WITH borrada AS (
  DELETE FROM escuela.categorias WHERE id = $1::int AND NOT EXISTS (SELECT 1 FROM escuela.cursos WHERE categoria_id = $1::int) RETURNING id
)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM borrada) THEN 'ok'
  WHEN NOT EXISTS (SELECT 1 FROM escuela.categorias WHERE id = $1::int) THEN 'no_encontrada'
  ELSE 'en_uso' END AS resultado;""", "={{ [$json.datos.id] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
if (r.resultado === 'ok') return [{{ json: {{ estado: 204, cuerpo: null }} }}];
if (r.resultado === 'no_encontrada') return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'La categoría no existe.' }} }} }} }}];
if (r.resultado === 'en_uso') return [{{ json: {{ estado: 409, cuerpo: {{ error: {{ codigo: 'CATEGORIA_EN_USO', mensaje: 'La categoría tiene cursos asignados.' }} }} }} }}];
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 240, 0)
    f.unir("Entrada valida", "Borrar en la base"); f.unir("Borrar en la base", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Borrar en la base", "Armar respuesta"], "Borrar en la base", "Borra solo si ningún curso la usa: `409 CATEGORIA_EN_USO`. Responde `204` sin cuerpo.")
    f.general("Borrar categoria", "`POST /escuela/admin/borrar-categoria` · solo `administrador`.\n\nEntrada: `{ id }`. Responde `204`.")
    f.guardar()


def buscar_usuario():
    f = Flujo("escBuscarUsuario01", "Buscar usuario", "GET /escuela/admin/buscar-usuario?correo=. Busca una cuenta por su correo exacto en Supabase Auth (API admin) y devuelve sus roles de la escuela (solo administrador). No guarda ejecuciones.", "usuarios")
    x = protegido(f, "GET", "escuela/admin/buscar-usuario", "administrador", "query", {"correo": {"tipo": "correo"}})
    f.http("Consultar Supabase Auth", "GET", "=http://auth:9999/admin/users?filter={{ encodeURIComponent($json.datos.correo) }}", {}, x, 0, servicio=True)
    f.codigo("Elegir coincidencia", f"""const r = $input.first().json;
const correo = $('Entrada valida').first().json.datos.correo;
if (r.statusCode !== 200 || !r.body || !Array.isArray(r.body.users)) return [{{ json: {{ ok: false, estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];
const u = r.body.users.find((x) => String(x.email || '').toLowerCase() === correo);
if (!u) return [{{ json: {{ ok: false, estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'No hay ninguna cuenta con ese correo.' }} }} }} }}];
return [{{ json: {{ ok: true, id: u.id, correo: u.email, nombre: (u.user_metadata || {{}}).nombre ?? null, verificado: !!u.email_confirmed_at }} }}];""", x + 240, 0)
    f.si("Cuenta encontrada", "={{ $json.ok }}", x + 480, 0)
    f.sql("Consultar roles", "SELECT coalesce(array_agg(rol ORDER BY rol), '{}') AS roles FROM escuela.roles_usuario WHERE usuario_id = $1::uuid;", "={{ [$json.id] }}", x + 720, 0)
    f.codigo("Armar respuesta", """const u = $('Elegir coincidencia').first().json;
return [{ json: { estado: 200, cuerpo: { id: u.id, correo: u.correo, nombre: u.nombre, verificado: u.verificado, roles: $input.first().json.roles } } }];""", x + 960, 0)
    f.unir("Entrada valida", "Consultar Supabase Auth"); f.unir("Consultar Supabase Auth", "Elegir coincidencia"); f.unir("Elegir coincidencia", "Cuenta encontrada")
    f.unir("Cuenta encontrada", "Consultar roles", 0); f.unir("Cuenta encontrada", "Responder", 1)
    f.unir("Consultar roles", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Buscar en Supabase Auth", "Llama a `auth:9999/admin/users?filter=` con la credencial de rol de servicio y se queda con la cuenta cuyo correo coincide exacto. Si no hay, `404`.", NOTA_PERMISOS,
              ["Consultar Supabase Auth", "Elegir coincidencia", "Cuenta encontrada"], True, "Busca la cuenta por correo en la API admin de Supabase Auth.")
    cierre(f, x + 1200, ["Consultar roles", "Armar respuesta"], "Cargar roles", "Lee los roles de la escuela de esa cuenta y arma `{ id, correo, nombre, verificado, roles }`.")
    f.general("Buscar usuario", "`GET /escuela/admin/buscar-usuario?correo=` · solo `administrador`.\n\nLo usa la pantalla *Roles* para encontrar a quién dar o quitar el rol. Usa la credencial **Supabase rol de servicio**, que nunca sale de n8n.")
    f.guardar()


def asignar_rol():
    f = Flujo("escAsignarRol01", "Asignar rol", "POST /escuela/admin/asignar-rol. Da o quita el rol instructor o administrador a una cuenta (solo administrador). Al dar instructor guarda su nombre público. No guarda ejecuciones.", "usuarios")
    x = protegido(f, "POST", "escuela/admin/asignar-rol", "administrador", "body", {
        "usuario_id": {"tipo": "uuid"}, "rol": {"tipo": "opcion", "valores": ["instructor", "administrador"]}, "activo": {"tipo": "booleano"}})
    f.codigo("Evitar quedarse sin admin", f"""const e = $input.first().json;
const d = e.datos;
if (d.rol === 'administrador' && !d.activo && d.usuario_id === e.usuario.id) {{
  return [{{ json: {{ ok: false, estado: 409, cuerpo: {{ error: {{ codigo: 'ESTADO_INVALIDO', mensaje: 'No puedes quitarte a ti mismo el rol de administrador.' }} }} }} }}];
}}
return [{{ json: {{ ...e, ok: true }} }}];""", x, 0)
    f.si("Cambio permitido", "={{ $json.ok }}", x + 240, 0)
    f.http("Consultar cuenta en Supabase Auth", "GET", "=http://auth:9999/admin/users/{{ $json.datos.usuario_id }}", {}, x + 480, 0, servicio=True)
    f.codigo("Leer cuenta", f"""const r = $input.first().json;
const e = $('Cambio permitido').first().json;
if (r.statusCode === 404) return [{{ json: {{ ok: false, estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'La cuenta no existe.' }} }} }} }}];
if (r.statusCode !== 200 || !r.body || !r.body.id) return [{{ json: {{ ok: false, estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];
const nombre = ((r.body.user_metadata || {{}}).nombre || String(r.body.email || '').split('@')[0] || 'Instructor').slice(0, 80);
return [{{ json: {{ ok: true, nombre, datos: e.datos, quien: e.usuario.id }} }}];""", x + 720, 0)
    f.si("Cuenta existe", "={{ $json.ok }}", x + 960, 0)
    f.sql("Aplicar el rol", """WITH quitar AS (
  DELETE FROM escuela.roles_usuario WHERE usuario_id = $1::uuid AND rol = $2::text AND NOT $3::boolean RETURNING 1
), poner AS (
  INSERT INTO escuela.roles_usuario (usuario_id, rol, asignado_por) SELECT $1::uuid, $2::text, $4::uuid WHERE $3::boolean ON CONFLICT DO NOTHING RETURNING 1
), perfil AS (
  INSERT INTO escuela.perfiles_instructor (usuario_id, nombre_publico) SELECT $1::uuid, $5::text WHERE $3::boolean AND $2::text = 'instructor'
  ON CONFLICT (usuario_id) DO UPDATE SET nombre_publico = EXCLUDED.nombre_publico, actualizado_en = now() RETURNING 1
)
SELECT 'ok' AS resultado;""", "={{ [$json.datos.usuario_id, $json.datos.rol, $json.datos.activo, $json.quien, $json.nombre] }}", x + 1200, 0)
    f.codigo("Armar respuesta", "const d = $('Leer cuenta').first().json.datos;\nreturn [{ json: { estado: 200, cuerpo: { usuario_id: d.usuario_id, rol: d.rol, activo: d.activo } } }];", x + 1440, 0)
    f.unir("Entrada valida", "Evitar quedarse sin admin"); f.unir("Evitar quedarse sin admin", "Cambio permitido")
    f.unir("Cambio permitido", "Consultar cuenta en Supabase Auth", 0); f.unir("Cambio permitido", "Responder", 1)
    f.unir("Consultar cuenta en Supabase Auth", "Leer cuenta"); f.unir("Leer cuenta", "Cuenta existe")
    f.unir("Cuenta existe", "Aplicar el rol", 0); f.unir("Cuenta existe", "Responder", 1)
    f.unir("Aplicar el rol", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Revisar el cambio", "Un administrador no puede quitarse a sí mismo el rol (`409 ESTADO_INVALIDO`): así la escuela nunca se queda sin administradores.", NOTA_PERMISOS,
              ["Evitar quedarse sin admin", "Cambio permitido"], True, "Impide que un administrador se quite su propio rol.")
    f.seccion("Confirmar la cuenta", "Pregunta a `auth:9999/admin/users/<id>` (rol de servicio) que la cuenta exista y toma su nombre. Si no existe, `404`.", NOTA_PERMISOS,
              ["Consultar cuenta en Supabase Auth", "Leer cuenta", "Cuenta existe"], True, "Confirma que la cuenta existe en Supabase Auth y lee su nombre.")
    cierre(f, x + 1680, ["Aplicar el rol", "Armar respuesta"], "Aplicar el rol", "Inserta o borra la fila de `roles_usuario`. Al dar `instructor` guarda o actualiza su `nombre_publico` en `perfiles_instructor`.")
    f.general("Asignar rol", "`POST /escuela/admin/asignar-rol` · solo `administrador`.\n\nEntrada: `{ usuario_id, rol: 'instructor' | 'administrador', activo }`. El rol `equipo_apoyo` no se asigna a mano: lo da aceptar una invitación.")
    f.guardar()


if __name__ == "__main__":
    validar_sesion_y_roles()
    mis_roles()
    exigir_rol()
    validar_campos()
    categorias()
    guardar_categoria()
    borrar_categoria()
    buscar_usuario()
    asignar_rol()
