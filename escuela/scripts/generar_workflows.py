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
CRED_TRANSCODIFICADOR = {"httpHeaderAuth": {"id": "secretoTranscodificador01", "name": "Secreto transcodificador"}}
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
    def webhook(self, metodo, ruta, x=0, y=0, credenciales=None):
        return self.nodo("Recibir solicitud", "n8n-nodes-base.webhook", 2.1,
                         {"httpMethod": metodo, "path": ruta, "authentication": "headerAuth",
                          "responseMode": "responseNode", "options": {}}, x, y,
                         credentials=credenciales or CRED_PROXY, webhookId=uid(self.id, "webhook"))

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

    def http(self, nombre, metodo, url, cabeceras, x, y, servicio=False, formato="json", transcodificador=False, cuerpo=None, tiempo=None):
        p = {"method": metodo, "url": url, "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": formato}}},
             "sendHeaders": True, "specifyHeaders": "keypair",
             "headerParameters": {"parameters": [{"name": k, "value": v} for k, v in cabeceras.items()]}}
        extra = {}
        if tiempo:  # milisegundos; si se pasa, el nodo falla y el workflow sigue por la rama de error
            p["options"]["timeout"] = tiempo
        if cuerpo:
            p.update({"sendBody": True, "specifyBody": "json", "jsonBody": cuerpo})
        if transcodificador:  # credencial compartida con el transcodificador (cabecera X-Secreto-Transcodificador)
            p.update({"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"})
            p.pop("sendHeaders"); p.pop("specifyHeaders"); p.pop("headerParameters")
            extra["credentials"] = {"httpHeaderAuth": {"id": "secretoTranscodificador01", "name": "Secreto transcodificador"}}
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
              "Subworkflow. Recibe la solicitud del webhook más rol_requerido (un rol, una lista de roles —basta con uno— o `cualquiera`: solo exige sesión), valida la sesión con Validar sesion y roles y comprueba que el usuario lo tenga. "
              "Devuelve el mismo item con { ok, usuario, roles, equipos } o { ok: false, estado: 401 o 403, cuerpo }.", "usuarios")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.subflujo("Validar sesion y roles", "escValidar01", 240, 0)
    f.si("Sesion valida", "={{ $json.ok }}", 480, 0)
    f.codigo("Comprobar rol", f"""const contexto = $input.first().json;
const original = $('Disparador').first().json;
const requeridos = [].concat(original.rol_requerido);
if (!requeridos.includes('cualquiera') && !requeridos.some((r) => contexto.roles.includes(r))) {{
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
    f.general("Exigir rol", "Subworkflow compartido: **ningún endpoint protegido repite la comprobación de permisos**.\n\nEntrada: la solicitud del webhook y `rol_requerido` (un rol o una lista de roles: basta con uno). Salida: el mismo item con `usuario`, `roles` y `equipos`, o `{ ok: false, estado, cuerpo }`.")
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
const presentes = Object.keys(datos).filter((k) => k in reglas);
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
  } else if (r.tipo === 'lista_texto') {
    if (!Array.isArray(v)) { falla(campo, 'tipo_lista', 'Debe ser una lista de textos.'); continue; }
    if (r.maximo_items && v.length > r.maximo_items) falla(campo, 'maximo_elementos', `Puede tener como máximo ${r.maximo_items} elementos.`);
    const elementos = [];
    for (const el of v) {
      const t = typeof el === 'string' ? el.trim() : '';
      if (!t || (r.maximo && t.length > r.maximo)) { falla(campo, 'elemento_invalido', `Cada elemento debe ser un texto de 1 a ${r.maximo || 200} caracteres.`); break; }
      elementos.push(t);
    }
    v = elementos;
  } else if (r.tipo === 'opcion') {
    if (!(r.valores || []).includes(v)) { falla(campo, 'valor_no_permitido', `Debe ser uno de: ${(r.valores || []).join(', ')}.`); continue; }
  }
  limpio[campo] = v;
}
if (detalles.length) return respuesta('Revisa los datos enviados.');
const { reglas: _reglas, datos: _datos, ...resto } = entrada;
return [{ json: { ...resto, ok: true, datos: limpio, presentes } }];"""


def validar_campos():
    f = Flujo("escValidarCampos01", "Validar campos",
              "Subworkflow. Recibe { datos, reglas } (reglas por campo: tipo texto, entero, booleano, uuid, correo u opcion, con minimo, maximo, opcional…) y devuelve el mismo item con datos normalizados "
              "o { ok: false, estado: 422, cuerpo } con VALIDACION_FALLIDA. Rechaza los campos que no estén en las reglas.", "escuela")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.codigo("Aplicar reglas", JS_VALIDAR_CAMPOS, 240, 0)
    f.unir("Disparador", "Aplicar reglas")
    f.seccion("Entrada", "Recibe `datos` (cuerpo o consulta del webhook) y las `reglas` de cada campo.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Aplicar reglas", "Rechaza campos extra y valida tipo, largo y rango. Normaliza (recorta textos, correos en minúscula, enteros reales) y devuelve todos los errores juntos.", NOTA_PERMISOS, ["Aplicar reglas"])
    f.general("Validar campos", "Subworkflow compartido: **ningún endpoint repite su validación de datos**, solo declara sus reglas.\n\nTipos: `texto`, `entero`, `booleano`, `uuid`, `correo`, `opcion`, `lista_texto`. Un campo vacío es un error salvo que la regla diga `opcional`. `presentes` lista los campos que sí llegaron, para distinguir «no enviado» de «vaciado».")
    f.guardar()


def protegido(f, metodo, ruta, rol, origen, reglas, acceso=None, credenciales=None):
    """Entrada común de un endpoint: webhook, permiso por rol (si rol) y validación de campos (si reglas).
    Los errores de los dos pasos van directo a "Responder". Devuelve la columna libre siguiente."""
    f.webhook(metodo, ruta, 0, 0, credenciales)
    anterior, x, previos = "Recibir solicitud", 240, []
    f.seccion("Entrada", "Webhook protegido por " + ("el secreto del transcodificador (interno, no está en Caddy)." if credenciales else "el secreto del proxy (Caddy es la única entrada)."), NOTA_ENTRADA, ["Recibir solicitud"])
    if rol:
        f.codigo("Definir reglas", f"""const e = $input.first().json;
return [{{ json: {{ headers: e.headers, rol_requerido: {json.dumps(rol)}, datos: e.{origen}, reglas: {json.dumps(reglas, ensure_ascii=False)}{', acceso: ' + json.dumps(acceso) if acceso else ''} }} }}];""", x, 0)
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
        previos = ["Definir reglas"]  # sin permiso que comprobar, "Definir reglas" entra en el grupo de validación
    f.subflujo("Validar campos", "escValidarCampos01", x, 0)
    f.si("Entrada valida", "={{ $json.ok }}", x + 240, 0)
    f.unir(anterior, "Validar campos"); f.unir("Validar campos", "Entrada valida"); f.unir("Entrada valida", "Responder", 1)
    f.seccion("Validar entrada", "Subworkflow `Validar campos`: tipos, largos y campos extra. Si falla, `422 VALIDACION_FALLIDA` con la lista de reglas.", NOTA_ENTRADA,
              previos + ["Validar campos", "Entrada valida"], True, "Valida y normaliza los campos con el subworkflow compartido.")
    x += 480
    if acceso:
        f.subflujo("Validar acceso a curso", "escValidarAcceso01", x, 0)
        f.si("Acceso valido", "={{ $json.ok }}", x + 240, 0)
        f.unir("Entrada valida", "Validar acceso a curso"); f.unir("Validar acceso a curso", "Acceso valido"); f.unir("Acceso valido", "Responder", 1)
        que = "el instructor dueño" if acceso["modo"] == "dueno" else "el dueño o su equipo de apoyo"
        f.seccion("Comprobar curso", f"Subworkflow `Validar acceso a curso`: solo {que}. Curso ajeno: `403`; inexistente: `404`" + ("; en revisión: `409`." if acceso["editable"] else "."), NOTA_PERMISOS,
                  ["Validar acceso a curso", "Acceso valido"], True, "Comprueba que el curso existe y que el usuario puede tocarlo.")
        x += 480
    return x


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


def buscar_cuenta():
    f = Flujo("escBuscarCuenta01", "Buscar cuenta por correo",
              "Subworkflow. Recibe { datos: { correo } }, busca esa cuenta en Supabase Auth con la API admin (auth:9999/admin/users?filter=) y la credencial de rol de servicio, "
              "y devuelve { ok: true, id, correo, nombre, verificado } o { ok: false, estado, cuerpo }. Lo usan Buscar usuario e Invitar equipo.", "usuarios")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.http("Consultar Supabase Auth", "GET", "=http://auth:9999/admin/users?filter={{ encodeURIComponent($json.datos.correo) }}", {}, 240, 0, servicio=True)
    f.codigo("Elegir coincidencia", f"""const r = $input.first().json;
const correo = $('Disparador').first().json.datos.correo;
if (r.statusCode !== 200 || !r.body || !Array.isArray(r.body.users)) return [{{ json: {{ ok: false, estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];
const u = r.body.users.find((x) => String(x.email || '').toLowerCase() === correo);
if (!u) return [{{ json: {{ ok: false, estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'No hay ninguna cuenta con ese correo.' }} }} }} }}];
return [{{ json: {{ ok: true, id: u.id, correo: u.email, nombre: (u.user_metadata || {{}}).nombre ?? null, verificado: !!u.email_confirmed_at }} }}];""", 480, 0)
    f.unir("Disparador", "Consultar Supabase Auth"); f.unir("Consultar Supabase Auth", "Elegir coincidencia")
    f.seccion("Entrada", "Recibe `datos.correo`, ya validado y en minúsculas.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Buscar en Supabase Auth", "El filtro de la API admin busca por trozo de correo; aquí se elige solo la cuenta con el correo **exacto**. Sin coincidencia: `404 NO_ENCONTRADO`.", NOTA_PERMISOS,
              ["Consultar Supabase Auth", "Elegir coincidencia"], True, "Busca la cuenta por correo exacto con la credencial de servicio.")
    f.general("Buscar cuenta por correo", "Subworkflow compartido: **ningún workflow repite la búsqueda de cuentas por correo**.\n\nUsa la credencial **Supabase rol de servicio**, que nunca sale de n8n. Salida: `{ ok, id, correo, nombre, verificado }` o `{ ok: false, estado, cuerpo }`.")
    f.guardar()


def buscar_usuario():
    f = Flujo("escBuscarUsuario01", "Buscar usuario", "GET /escuela/admin/buscar-usuario?correo=. Busca una cuenta por su correo exacto en Supabase Auth (API admin) y devuelve sus roles de la escuela (solo administrador). No guarda ejecuciones.", "usuarios")
    x = protegido(f, "GET", "escuela/admin/buscar-usuario", "administrador", "query", {"correo": {"tipo": "correo"}})
    f.subflujo("Buscar cuenta por correo", "escBuscarCuenta01", x, 0)
    f.si("Cuenta encontrada", "={{ $json.ok }}", x + 240, 0)
    f.sql("Consultar roles", "SELECT coalesce(array_agg(rol ORDER BY rol), '{}') AS roles FROM escuela.roles_usuario WHERE usuario_id = $1::uuid;", "={{ [$json.id] }}", x + 480, 0)
    f.codigo("Armar respuesta", """const u = $('Buscar cuenta por correo').first().json;
return [{ json: { estado: 200, cuerpo: { id: u.id, correo: u.correo, nombre: u.nombre, verificado: u.verificado, roles: $input.first().json.roles } } }];""", x + 720, 0)
    f.unir("Entrada valida", "Buscar cuenta por correo"); f.unir("Buscar cuenta por correo", "Cuenta encontrada")
    f.unir("Cuenta encontrada", "Consultar roles", 0); f.unir("Cuenta encontrada", "Responder", 1)
    f.unir("Consultar roles", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Buscar la cuenta", "Subworkflow `Buscar cuenta por correo`. Sin cuenta con ese correo: `404`.", NOTA_PERMISOS,
              ["Buscar cuenta por correo", "Cuenta encontrada"], True, "Busca la cuenta con el subworkflow compartido.")
    cierre(f, x + 960, ["Consultar roles", "Armar respuesta"], "Cargar roles", "Lee los roles de la escuela de esa cuenta y arma `{ id, correo, nombre, verificado, roles }`.")
    f.general("Buscar usuario", "`GET /escuela/admin/buscar-usuario?correo=` · solo `administrador`.\n\nLo usa la pantalla *Roles* para encontrar a quién dar o quitar el rol.")
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


def validar_acceso():
    f = Flujo("escValidarAcceso01", "Validar acceso a curso",
              "Subworkflow. Recibe el item con usuario, datos y acceso { modo: dueno | dueno_o_equipo, editable, tipo: curso | seccion | clase | video | dato, campo }, "
              "busca el curso afectado y comprueba que exista, que el usuario sea su dueño o de su equipo de apoyo y, si editable, que no esté en revisión.", "escuela")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.codigo("Resolver objetivo", """const e = $input.first().json;
const a = e.acceso || {};
const tipo = a.tipo === 'dato' ? e.datos.tipo : a.tipo;
return [{ json: { tipo, id: e.datos[a.campo], usuario_id: e.usuario.id } }];""", 240, 0)
    f.sql("Consultar curso", """WITH objetivo AS (
  SELECT CASE $1::text
    WHEN 'curso' THEN $2::bigint
    WHEN 'seccion' THEN (SELECT curso_id FROM escuela.secciones WHERE id = $2::bigint)
    WHEN 'clase' THEN (SELECT s.curso_id FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE k.id = $2::bigint)
    WHEN 'video' THEN (SELECT s.curso_id FROM escuela.videos_clase v JOIN escuela.clases k ON k.id = v.clase_id JOIN escuela.secciones s ON s.id = k.seccion_id WHERE v.id = $2::bigint)
  END AS curso_id
)
SELECT c.id, c.instructor_id, c.estado,
       (c.instructor_id = $3::uuid) AS es_dueno,
       EXISTS (SELECT 1 FROM escuela.equipos_apoyo e WHERE e.instructor_id = c.instructor_id AND e.miembro_id = $3::uuid) AS es_equipo
FROM objetivo o JOIN escuela.cursos c ON c.id = o.curso_id;""", "={{ [$json.tipo, $json.id, $json.usuario_id] }}", 480, 0)
    f.codigo("Decidir acceso", f"""const original = $('Disparador').first().json;
const c = $input.first().json;
const a = original.acceso;
const error = (estado, codigo, mensaje) => [{{ json: {{ ok: false, estado, cuerpo: {{ error: {{ codigo, mensaje }} }} }} }}];
if (!c.id) return error(404, 'NO_ENCONTRADO', 'El curso no existe.');
if (!(a.modo === 'dueno' ? c.es_dueno : c.es_dueno || c.es_equipo)) return error(403, 'SIN_PERMISO', 'No tienes permiso para hacer esto.');
if (a.editable && c.estado === 'en_revision') return error(409, 'CURSO_EN_REVISION', 'El curso está en revisión y no se puede editar.');
return [{{ json: {{ ...original, ok: true, curso: {{ id: Number(c.id), instructor_id: c.instructor_id, estado: c.estado }}, es_dueno: c.es_dueno }} }}];""", 720, 0)
    f.unir("Disparador", "Resolver objetivo"); f.unir("Resolver objetivo", "Consultar curso"); f.unir("Consultar curso", "Decidir acceso")
    f.seccion("Entrada", "Recibe el item del endpoint con `usuario`, `datos` y `acceso`.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Comprobar acceso", "Resuelve el curso (directo, o a partir de una sección, una clase o un video), lo consulta y decide: `404` si no existe, `403` si no es del usuario ni de su equipo, `409` si está en revisión y se va a editar.", NOTA_PERMISOS,
              ["Resolver objetivo", "Consultar curso", "Decidir acceso"], True, "Resuelve el curso y decide si el usuario puede tocarlo.")
    f.general("Validar acceso a curso", "Subworkflow compartido: **ningún endpoint de cursos repite la comprobación de propiedad**.\n\n`acceso.modo`: `dueno` o `dueno_o_equipo` (instructor dueño o miembro de su equipo de apoyo). `acceso.editable`: si es `true`, un curso `en_revision` se rechaza. Devuelve el item con `curso` y `es_dueno`.")
    f.guardar()


def mis_cursos():
    f = Flujo("escMisCursos01", "Mis cursos", "GET /escuela/mis-cursos. Cursos del instructor y de los instructores cuyo equipo de apoyo integra el usuario, en cualquier estado. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/mis-cursos", ["instructor", "equipo_apoyo"], "query", {})
    f.sql("Consultar cursos", """SELECT coalesce(json_agg(t ORDER BY t.actualizado_en DESC), '[]'::json) AS cursos FROM (
  SELECT c.id, c.slug, c.titulo, c.estado, c.comentario_revision, c.portada_ruta, c.actualizado_en,
         (c.instructor_id = $1::uuid) AS es_mio, coalesce(p.nombre_publico, 'Instructor') AS instructor
  FROM escuela.cursos c LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = c.instructor_id
  WHERE c.instructor_id = $1::uuid
     OR c.instructor_id IN (SELECT instructor_id FROM escuela.equipos_apoyo WHERE miembro_id = $1::uuid)
) t;""", "={{ [$json.usuario.id] }}", x, 0)
    f.codigo("Armar respuesta", "return [{ json: { estado: 200, cuerpo: { cursos: $input.first().json.cursos } } }];", x + 240, 0)
    f.unir("Entrada valida", "Consultar cursos"); f.unir("Consultar cursos", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar cursos", "Armar respuesta"], "Listar cursos", "Cursos propios y de los instructores del equipo, del más reciente al más antiguo, con su estado y el comentario de la revisión.")
    f.general("Mis cursos", "`GET /escuela/mis-cursos` · `instructor` o `equipo_apoyo`.\n\nAlimenta la pantalla *Mis cursos*. `es_mio` distingue los cursos propios de los del instructor al que se apoya.")
    f.guardar()


def curso_edicion():
    f = Flujo("escCursoEdicion01", "Curso para edicion", "GET /escuela/curso-edicion?id=. Curso completo con su temario para el editor; solo el instructor dueño o su equipo de apoyo. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/curso-edicion", ["instructor", "equipo_apoyo"], "query", {"id": {"tipo": "entero", "minimo": 1, "maximo": 9007199254740}},
                  {"modo": "dueno_o_equipo", "editable": False, "tipo": "curso", "campo": "id"})
    f.sql("Consultar curso completo", """SELECT json_build_object(
  'id', c.id, 'slug', c.slug, 'titulo', c.titulo, 'subtitulo', c.subtitulo, 'descripcion', c.descripcion,
  'conocimientos_previos', c.conocimientos_previos, 'lo_que_aprenderas', c.lo_que_aprenderas, 'nivel', c.nivel,
  'categoria_id', c.categoria_id, 'estado', c.estado, 'comentario_revision', c.comentario_revision,
  'portada_ruta', c.portada_ruta, 'actualizado_en', c.actualizado_en,
  'secciones', coalesce((
    SELECT json_agg(json_build_object('id', s.id, 'titulo', s.titulo, 'posicion', s.posicion, 'clases', coalesce((
      SELECT json_agg(json_build_object('id', k.id, 'titulo', k.titulo, 'descripcion', k.descripcion,
             'duracion_estimada_minutos', k.duracion_estimada_minutos, 'es_muestra', k.es_muestra, 'posicion', k.posicion,
             'video', (SELECT json_build_object('estado', v.estado, 'duracion_segundos', v.duracion_segundos) FROM escuela.videos_clase v WHERE v.clase_id = k.id AND v.vigente),
             'video_nuevo', (SELECT json_build_object('id', v.id, 'estado', v.estado, 'error', v.error) FROM escuela.videos_clase v WHERE v.clase_id = k.id AND NOT v.vigente ORDER BY v.id DESC LIMIT 1)) ORDER BY k.posicion)
      FROM escuela.clases k WHERE k.seccion_id = s.id), '[]'::json)) ORDER BY s.posicion)
    FROM escuela.secciones s WHERE s.curso_id = c.id), '[]'::json)) AS curso
FROM escuela.cursos c WHERE c.id = $1::bigint;""", "={{ [$json.curso.id] }}", x, 0)
    f.codigo("Armar respuesta", "const dueno = $('Acceso valido').first().json.es_dueno;\nreturn [{ json: { estado: 200, cuerpo: { ...$input.first().json.curso, es_dueno: dueno } } }];", x + 240, 0)
    f.unir("Acceso valido", "Consultar curso completo"); f.unir("Consultar curso completo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar curso completo", "Armar respuesta"], "Leer el curso", "Devuelve el curso con sus secciones y clases en orden (cada clase con su `video` vigente y su `video_nuevo` en proceso o con error) y `es_dueno` para que el editor sepa si puede cambiar los datos del curso.")
    f.general("Curso para edicion", "`GET /escuela/curso-edicion?id=` · dueño o equipo de apoyo.\n\nTrae todo lo que necesita el editor: datos del curso, estado, comentario de la revisión y temario. A diferencia de la ficha pública, incluye cursos en borrador y en revisión.")
    f.guardar()


def crear_curso():
    f = Flujo("escCrearCurso01", "Crear curso", "POST /escuela/crear-curso. Crea un curso en borrador para el instructor con un slug único generado del título. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/crear-curso", "instructor", "body", {"titulo": {"tipo": "texto", "minimo": 5, "maximo": 120, "alfanumerico": True}})
    f.sql("Insertar el curso", """WITH base AS (
  SELECT coalesce(nullif(trim(both '-' from lower(regexp_replace(escuela.sin_acentos($1::text), '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'curso') AS slug
), libre AS (
  SELECT CASE WHEN k = 1 THEN b.slug ELSE b.slug || '-' || k END AS slug
  FROM base b, generate_series(1, 1000) k
  WHERE NOT EXISTS (SELECT 1 FROM escuela.cursos c WHERE c.slug = CASE WHEN k = 1 THEN b.slug ELSE b.slug || '-' || k END)
  ORDER BY k LIMIT 1
)
INSERT INTO escuela.cursos (slug, instructor_id, titulo) SELECT slug, $2::uuid, $1::text FROM libre
ON CONFLICT (slug) DO NOTHING RETURNING id, slug;""", "={{ [$json.datos.titulo, $json.usuario.id] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
if (r.id) return [{{ json: {{ estado: 201, cuerpo: {{ id: Number(r.id), slug: r.slug }} }} }}];
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 240, 0)
    f.unir("Entrada valida", "Insertar el curso"); f.unir("Insertar el curso", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Insertar el curso", "Armar respuesta"], "Crear el curso", "Genera el slug del título (sin acentos, con guiones) y le añade `-2`, `-3`… hasta encontrar uno libre. El curso nace en `borrador`.")
    f.general("Crear curso", "`POST /escuela/crear-curso` · solo `instructor`.\n\nEntrada: `{ titulo }`. Responde `201 { id, slug }`. El slug se fija al crear y no cambia aunque se renombre el curso.")
    f.guardar()


def editar_curso():
    f = Flujo("escEditarCurso01", "Editar curso", "POST /escuela/editar-curso. Cambia los datos de un curso (solo el instructor dueño, y no mientras esté en revisión). Solo se tocan los campos enviados. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/editar-curso", "instructor", "body", {
        "curso_id": {"tipo": "entero", "minimo": 1, "maximo": 9007199254740},
        "titulo": {"tipo": "texto", "opcional": True, "minimo": 5, "maximo": 120, "alfanumerico": True},
        "subtitulo": {"tipo": "texto", "opcional": True, "maximo": 200},
        "descripcion": {"tipo": "texto", "opcional": True, "maximo": 5000, "multilinea": True},
        "conocimientos_previos": {"tipo": "texto", "opcional": True, "maximo": 2000, "multilinea": True},
        "lo_que_aprenderas": {"tipo": "lista_texto", "opcional": True, "maximo_items": 10, "maximo": 150},
        "nivel": {"tipo": "opcion", "opcional": True, "valores": ["basico", "intermedio", "avanzado"]},
        "categoria_id": {"tipo": "entero", "opcional": True, "minimo": 1, "maximo": 32000}},
        {"modo": "dueno", "editable": True, "tipo": "curso", "campo": "curso_id"})
    f.sql("Actualizar el curso", """WITH p AS (SELECT string_to_array($9::text, ',') AS presentes),
cat AS (SELECT ($8::int IS NULL OR EXISTS (SELECT 1 FROM escuela.categorias WHERE id = $8::int)) AS ok),
actualizado AS (
  UPDATE escuela.cursos c SET
    titulo = CASE WHEN 'titulo' = ANY(p.presentes) AND $2::text IS NOT NULL THEN $2::text ELSE c.titulo END,
    subtitulo = CASE WHEN 'subtitulo' = ANY(p.presentes) THEN $3::text ELSE c.subtitulo END,
    descripcion = CASE WHEN 'descripcion' = ANY(p.presentes) THEN $4::text ELSE c.descripcion END,
    conocimientos_previos = CASE WHEN 'conocimientos_previos' = ANY(p.presentes) THEN $5::text ELSE c.conocimientos_previos END,
    lo_que_aprenderas = CASE WHEN 'lo_que_aprenderas' = ANY(p.presentes) THEN ARRAY(SELECT jsonb_array_elements_text($6::jsonb)) ELSE c.lo_que_aprenderas END,
    nivel = CASE WHEN 'nivel' = ANY(p.presentes) THEN $7::text ELSE c.nivel END,
    categoria_id = CASE WHEN 'categoria_id' = ANY(p.presentes) THEN $8::int ELSE c.categoria_id END,
    actualizado_en = now()
  FROM p, cat WHERE c.id = $1::bigint AND cat.ok RETURNING c.id
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM actualizado) THEN 'ok' WHEN NOT (SELECT ok FROM cat) THEN 'categoria_invalida' ELSE 'no_encontrado' END AS resultado;""",
          "={{ [$json.datos.curso_id, $json.datos.titulo, $json.datos.subtitulo, $json.datos.descripcion, $json.datos.conocimientos_previos, JSON.stringify($json.datos.lo_que_aprenderas), $json.datos.nivel, $json.datos.categoria_id, $json.presentes.join(',')] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
const id = $('Acceso valido').first().json.curso.id;
if (r.resultado === 'ok') return [{{ json: {{ estado: 200, cuerpo: {{ id }} }} }}];
if (r.resultado === 'categoria_invalida') return [{{ json: {{ estado: 422, cuerpo: {{ error: {{ codigo: 'VALIDACION_FALLIDA', mensaje: 'Revisa los datos enviados.', detalles: [{{ campo: 'categoria_id', regla: 'categoria_inexistente', mensaje: 'La categoría no existe.' }}] }} }} }} }}];
if (r.resultado === 'no_encontrado') return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'El curso no existe.' }} }} }} }}];
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 240, 0)
    f.unir("Acceso valido", "Actualizar el curso"); f.unir("Actualizar el curso", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Actualizar el curso", "Armar respuesta"], "Actualizar el curso", "Cambia solo los campos que llegaron (`presentes`): enviar `\"\"` o `null` vacía un campo opcional y omitirlo lo deja igual. Una categoría que no existe da `422`.")
    f.general("Editar curso", "`POST /escuela/editar-curso` · solo el `instructor` dueño; el equipo de apoyo no cambia los datos del curso.\n\nEntrada: `{ curso_id, titulo?, subtitulo?, descripcion?, conocimientos_previos?, lo_que_aprenderas?, nivel?, categoria_id? }`. Un curso `en_revision` responde `409 CURSO_EN_REVISION`.")
    f.guardar()


ROLES_TEMARIO = ["instructor", "equipo_apoyo"]
TEXTO_ID = {"tipo": "entero", "minimo": 1, "maximo": 9007199254740}


def respuesta_temario(f, x, ok_js, titulo_nota, fuente="$input.first().json"):
    """Nodo "Armar respuesta" común de los endpoints del temario: 404 si el SQL no encontró nada."""
    f.codigo("Armar respuesta", f"""const r = {fuente};
{ok_js}
return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: '{titulo_nota} no existe en este curso.' }} }} }} }}];""", x, 0)


def guardar_seccion():
    f = Flujo("escGuardarSeccion01", "Guardar seccion", "POST /escuela/guardar-seccion. Crea una sección al final del temario o renombra una existente (instructor dueño o su equipo de apoyo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/guardar-seccion", ROLES_TEMARIO, "body", {
        "curso_id": TEXTO_ID, "seccion_id": {**TEXTO_ID, "opcional": True}, "titulo": {"tipo": "texto", "minimo": 1, "maximo": 120}},
        {"modo": "dueno_o_equipo", "editable": True, "tipo": "curso", "campo": "curso_id"})
    f.sql("Guardar la seccion", """WITH nueva AS (
  INSERT INTO escuela.secciones (curso_id, titulo, posicion)
  SELECT $1::bigint, $3::text, coalesce((SELECT max(posicion) FROM escuela.secciones WHERE curso_id = $1::bigint), 0) + 1
  WHERE $2::bigint IS NULL RETURNING id
), editada AS (
  UPDATE escuela.secciones SET titulo = $3::text WHERE id = $2::bigint AND curso_id = $1::bigint RETURNING id
)
SELECT coalesce((SELECT id FROM nueva), (SELECT id FROM editada)) AS id;""", "={{ [$json.datos.curso_id, $json.datos.seccion_id, $json.datos.titulo] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.id) return [{ json: { estado: 200, cuerpo: { id: Number(r.id) } } }];", "La sección")
    f.unir("Acceso valido", "Guardar la seccion"); f.unir("Guardar la seccion", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Guardar la seccion", "Armar respuesta"], "Guardar la seccion", "Sin `seccion_id` crea la sección al final (`posicion` = última + 1); con `seccion_id` la renombra. Una sección de otro curso da `404`.")
    f.general("Guardar seccion", "`POST /escuela/guardar-seccion` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ curso_id, seccion_id?, titulo }`. Responde `200 { id }`. Los cambios actualizan la fecha del curso con un disparador de `escuela`.")
    f.guardar()


def borrar_seccion():
    f = Flujo("escBorrarSeccion01", "Borrar seccion", "POST /escuela/borrar-seccion. Borra una sección con sus clases y renumera las demás (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/borrar-seccion", ROLES_TEMARIO, "body", {"seccion_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": True, "tipo": "seccion", "campo": "seccion_id"})
    f.sql("Borrar y renumerar", """WITH rutas AS (
  SELECT coalesce(array_agg(v.ruta_base), '{}') AS rutas FROM escuela.videos_clase v JOIN escuela.clases k ON k.id = v.clase_id WHERE k.seccion_id = $1::bigint
), borrada AS (
  DELETE FROM escuela.secciones WHERE id = $1::bigint RETURNING curso_id
), renumeradas AS (
  UPDATE escuela.secciones s SET posicion = n.nueva
  FROM (SELECT id, row_number() OVER (ORDER BY posicion) AS nueva FROM escuela.secciones
        WHERE curso_id = (SELECT curso_id FROM borrada) AND id <> $1::bigint) n
  WHERE s.id = n.id RETURNING s.id
)
SELECT EXISTS (SELECT 1 FROM borrada) AS borrada, (SELECT rutas FROM rutas) AS rutas_base;""", "={{ [$json.datos.seccion_id] }}", x, 0)
    f.codigo("Preparar rutas de videos", "const r = $input.first().json;\nreturn [{ json: { rutas_base: r.borrada ? (r.rutas_base || []) : [] } }];", x + 240, 0)
    f.subflujo("Borrar archivos de video", "escBorrarArchivosVideo01", x + 480, 0)
    respuesta_temario(f, x + 720, "if (r.borrada) return [{ json: { estado: 204, cuerpo: null } }];", "La sección", "$('Borrar y renumerar').first().json")
    f.unir("Acceso valido", "Borrar y renumerar"); f.unir("Borrar y renumerar", "Preparar rutas de videos"); f.unir("Preparar rutas de videos", "Borrar archivos de video")
    f.unir("Borrar archivos de video", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 960, ["Borrar y renumerar", "Preparar rutas de videos", "Borrar archivos de video", "Armar respuesta"], "Borrar y limpiar", "Borra la sección (sus clases y videos se van con ella), deja las demás numeradas `1..n` sin huecos y borra de Storage los archivos de sus videos (subworkflow compartido).")
    f.general("Borrar seccion", "`POST /escuela/borrar-seccion` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ seccion_id }`. Responde `204`.")
    f.guardar()


def guardar_clase():
    f = Flujo("escGuardarClase01", "Guardar clase", "POST /escuela/guardar-clase. Crea una clase al final de la sección o edita una existente: título, descripción, duración estimada y si es clase muestra (sin video todavía). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/guardar-clase", ROLES_TEMARIO, "body", {
        "seccion_id": TEXTO_ID, "clase_id": {**TEXTO_ID, "opcional": True}, "titulo": {"tipo": "texto", "minimo": 1, "maximo": 120},
        "descripcion": {"tipo": "texto", "opcional": True, "maximo": 2000, "multilinea": True},
        "duracion_estimada_minutos": {"tipo": "entero", "opcional": True, "minimo": 1, "maximo": 180}, "es_muestra": {"tipo": "booleano"}},
        {"modo": "dueno_o_equipo", "editable": True, "tipo": "seccion", "campo": "seccion_id"})
    f.sql("Guardar la clase", """WITH nueva AS (
  INSERT INTO escuela.clases (seccion_id, titulo, descripcion, duracion_estimada_minutos, es_muestra, posicion)
  SELECT $1::bigint, $3::text, $4::text, $5::int, $6::boolean, coalesce((SELECT max(posicion) FROM escuela.clases WHERE seccion_id = $1::bigint), 0) + 1
  WHERE $2::bigint IS NULL RETURNING id
), editada AS (
  UPDATE escuela.clases SET titulo = $3::text, descripcion = $4::text, duracion_estimada_minutos = $5::int, es_muestra = $6::boolean
  WHERE id = $2::bigint AND seccion_id = $1::bigint RETURNING id
)
SELECT coalesce((SELECT id FROM nueva), (SELECT id FROM editada)) AS id;""",
          "={{ [$json.datos.seccion_id, $json.datos.clase_id, $json.datos.titulo, $json.datos.descripcion, $json.datos.duracion_estimada_minutos, $json.datos.es_muestra] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.id) return [{ json: { estado: 200, cuerpo: { id: Number(r.id) } } }];", "La clase")
    f.unir("Acceso valido", "Guardar la clase"); f.unir("Guardar la clase", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Guardar la clase", "Armar respuesta"], "Guardar la clase", "Sin `clase_id` crea la clase al final de la sección; con `clase_id` reemplaza sus datos. `es_muestra` solo marca la clase: el video y su reproducción llegan en la SPEC 08.")
    f.general("Guardar clase", "`POST /escuela/guardar-clase` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ seccion_id, clase_id?, titulo, descripcion?, duracion_estimada_minutos?, es_muestra }`. Responde `200 { id }`. La duración es solo una estimación (1 a 180 min).")
    f.guardar()


def borrar_clase():
    f = Flujo("escBorrarClase01", "Borrar clase", "POST /escuela/borrar-clase. Borra una clase y renumera las de su sección (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/borrar-clase", ROLES_TEMARIO, "body", {"clase_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": True, "tipo": "clase", "campo": "clase_id"})
    f.sql("Borrar y renumerar", """WITH rutas AS (
  SELECT coalesce(array_agg(ruta_base), '{}') AS rutas FROM escuela.videos_clase WHERE clase_id = $1::bigint
), borrada AS (
  DELETE FROM escuela.clases WHERE id = $1::bigint RETURNING seccion_id
), renumeradas AS (
  UPDATE escuela.clases k SET posicion = n.nueva
  FROM (SELECT id, row_number() OVER (ORDER BY posicion) AS nueva FROM escuela.clases
        WHERE seccion_id = (SELECT seccion_id FROM borrada) AND id <> $1::bigint) n
  WHERE k.id = n.id RETURNING k.id
)
SELECT EXISTS (SELECT 1 FROM borrada) AS borrada, (SELECT rutas FROM rutas) AS rutas_base;""", "={{ [$json.datos.clase_id] }}", x, 0)
    f.codigo("Preparar rutas de videos", "const r = $input.first().json;\nreturn [{ json: { rutas_base: r.borrada ? (r.rutas_base || []) : [] } }];", x + 240, 0)
    f.subflujo("Borrar archivos de video", "escBorrarArchivosVideo01", x + 480, 0)
    respuesta_temario(f, x + 720, "if (r.borrada) return [{ json: { estado: 204, cuerpo: null } }];", "La clase", "$('Borrar y renumerar').first().json")
    f.unir("Acceso valido", "Borrar y renumerar"); f.unir("Borrar y renumerar", "Preparar rutas de videos"); f.unir("Preparar rutas de videos", "Borrar archivos de video")
    f.unir("Borrar archivos de video", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 960, ["Borrar y renumerar", "Preparar rutas de videos", "Borrar archivos de video", "Armar respuesta"], "Borrar y limpiar", "Borra la clase (y su video), deja las demás de su sección numeradas `1..n` sin huecos y borra de Storage los archivos del video (subworkflow compartido).")
    f.general("Borrar clase", "`POST /escuela/borrar-clase` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ clase_id }`. Responde `204`.")
    f.guardar()


def mover():
    f = Flujo("escMover01", "Mover", "POST /escuela/mover. Sube o baja una sección dentro del curso o una clase dentro de su sección, intercambiándola con su vecina (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/mover", ROLES_TEMARIO, "body", {
        "tipo": {"tipo": "opcion", "valores": ["seccion", "clase"]}, "id": TEXTO_ID, "direccion": {"tipo": "opcion", "valores": ["subir", "bajar"]}},
        {"modo": "dueno_o_equipo", "editable": True, "tipo": "dato", "campo": "id"})
    f.sql("Intercambiar posiciones", """WITH s_act AS (
  SELECT id, curso_id, posicion FROM escuela.secciones WHERE $1::text = 'seccion' AND id = $2::bigint
), s_vec AS (
  SELECT x.id, x.posicion FROM escuela.secciones x JOIN s_act a ON x.curso_id = a.curso_id AND x.posicion = a.posicion + $3::int
), s_mov AS (
  UPDATE escuela.secciones x SET posicion = CASE WHEN x.id = (SELECT id FROM s_act) THEN (SELECT posicion FROM s_vec) ELSE (SELECT posicion FROM s_act) END
  WHERE x.id IN ((SELECT id FROM s_act), (SELECT id FROM s_vec)) AND EXISTS (SELECT 1 FROM s_vec) RETURNING 1
), c_act AS (
  SELECT id, seccion_id, posicion FROM escuela.clases WHERE $1::text = 'clase' AND id = $2::bigint
), c_vec AS (
  SELECT x.id, x.posicion FROM escuela.clases x JOIN c_act a ON x.seccion_id = a.seccion_id AND x.posicion = a.posicion + $3::int
), c_mov AS (
  UPDATE escuela.clases x SET posicion = CASE WHEN x.id = (SELECT id FROM c_act) THEN (SELECT posicion FROM c_vec) ELSE (SELECT posicion FROM c_act) END
  WHERE x.id IN ((SELECT id FROM c_act), (SELECT id FROM c_vec)) AND EXISTS (SELECT 1 FROM c_vec) RETURNING 1
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM s_act UNION ALL SELECT 1 FROM c_act) THEN 'no_encontrado'
            WHEN EXISTS (SELECT 1 FROM s_mov UNION ALL SELECT 1 FROM c_mov) THEN 'movido' ELSE 'sin_cambio' END AS resultado;""",
          "={{ [$json.datos.tipo, $json.datos.id, $json.datos.direccion === 'subir' ? -1 : 1] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.resultado === 'movido' || r.resultado === 'sin_cambio') return [{ json: { estado: 200, cuerpo: { movido: r.resultado === 'movido' } } }];", "El elemento")
    f.unir("Acceso valido", "Intercambiar posiciones"); f.unir("Intercambiar posiciones", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Intercambiar posiciones", "Armar respuesta"], "Intercambiar posiciones", "Cambia de lugar al elemento con su vecino. Subir el primero o bajar el último no cambia nada y responde `200 { movido: false }`.")
    f.general("Mover", "`POST /escuela/mover` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ tipo: 'seccion' | 'clase', id, direccion: 'subir' | 'bajar' }`. Las posiciones son siempre `1..n`, así que mover es intercambiar con la vecina. Lo usan los botones *Subir* y *Bajar* del editor.")
    f.guardar()


JS_MENSAJES_FALTA = """const MENSAJES = {
  falta_subtitulo: 'Falta el subtítulo.', falta_descripcion: 'Falta la descripción.', falta_nivel: 'Falta elegir el nivel.',
  falta_categoria: 'Falta elegir la categoría.', falta_portada: 'Falta la portada.', falta_secciones: 'El curso necesita al menos una sección.',
  seccion_vacia: 'Hay secciones sin ninguna clase.', falta_video: 'Hay clases sin video listo.' };"""
JSON_CURSO_COMPLETO = """json_build_object(
  'id', c.id, 'slug', c.slug, 'titulo', c.titulo, 'subtitulo', c.subtitulo, 'descripcion', c.descripcion,
  'conocimientos_previos', c.conocimientos_previos, 'lo_que_aprenderas', c.lo_que_aprenderas, 'nivel', c.nivel,
  'categoria', (SELECT nombre FROM escuela.categorias WHERE id = c.categoria_id), 'portada_ruta', c.portada_ruta,
  'instructor', coalesce(p.nombre_publico, 'Instructor'), 'actualizado_en', c.actualizado_en,
  'secciones', coalesce((
    SELECT json_agg(json_build_object('id', s.id, 'titulo', s.titulo, 'posicion', s.posicion, 'clases', coalesce((
      SELECT json_agg(json_build_object('id', k.id, 'titulo', k.titulo, 'descripcion', k.descripcion,
             'duracion_estimada_minutos', k.duracion_estimada_minutos, 'es_muestra', k.es_muestra, 'posicion', k.posicion) ORDER BY k.posicion)
      FROM escuela.clases k WHERE k.seccion_id = s.id), '[]'::json)) ORDER BY s.posicion)
    FROM escuela.secciones s WHERE s.curso_id = c.id), '[]'::json))"""


def enviar_revision():
    f = Flujo("escEnviarRevision01", "Enviar a revision", "POST /escuela/enviar-revision. El instructor dueño envía su curso en borrador a revisión si está completo; si no, devuelve la lista de lo que falta. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/enviar-revision", "instructor", "body", {"curso_id": TEXTO_ID},
                  {"modo": "dueno", "editable": True, "tipo": "curso", "campo": "curso_id"})
    f.sql("Comprobar y enviar", """WITH c AS (SELECT * FROM escuela.cursos WHERE id = $1::bigint),
faltas AS (
  SELECT array_remove(ARRAY[
    CASE WHEN coalesce(trim(c.subtitulo), '') = '' THEN 'falta_subtitulo' END,
    CASE WHEN coalesce(trim(c.descripcion), '') = '' THEN 'falta_descripcion' END,
    CASE WHEN c.nivel IS NULL THEN 'falta_nivel' END,
    CASE WHEN c.categoria_id IS NULL THEN 'falta_categoria' END,
    CASE WHEN c.portada_ruta IS NULL THEN 'falta_portada' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM escuela.secciones s WHERE s.curso_id = c.id) THEN 'falta_secciones' END,
    CASE WHEN EXISTS (SELECT 1 FROM escuela.secciones s WHERE s.curso_id = c.id
                      AND NOT EXISTS (SELECT 1 FROM escuela.clases k WHERE k.seccion_id = s.id)) THEN 'seccion_vacia' END,
    CASE WHEN EXISTS (SELECT 1 FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE s.curso_id = c.id
                      AND NOT EXISTS (SELECT 1 FROM escuela.videos_clase v WHERE v.clase_id = k.id AND v.vigente AND v.estado = 'listo')) THEN 'falta_video' END
  ], NULL) AS lista FROM c
), enviado AS (
  UPDATE escuela.cursos SET estado = 'en_revision', comentario_revision = NULL, actualizado_en = now()
  WHERE id = $1::bigint AND estado = 'borrador' AND cardinality((SELECT lista FROM faltas)) = 0 RETURNING id
)
SELECT (SELECT lista FROM faltas) AS faltas, (SELECT estado FROM c) AS estado, EXISTS (SELECT 1 FROM enviado) AS enviado;""", "={{ [$json.datos.curso_id] }}", x, 0)
    f.codigo("Armar respuesta", f"""{JS_MENSAJES_FALTA}
const r = $input.first().json;
if (r.enviado) return [{{ json: {{ estado: 200, cuerpo: {{ estado: 'en_revision' }} }} }}];
if (r.estado !== 'borrador') return [{{ json: {{ estado: 409, cuerpo: {{ error: {{ codigo: 'ESTADO_INVALIDO', mensaje: 'Solo se pueden enviar a revisión los cursos en borrador.' }} }} }} }}];
if (Array.isArray(r.faltas) && r.faltas.length) {{
  const detalles = r.faltas.map((regla) => ({{ campo: 'curso', regla, mensaje: MENSAJES[regla] }}));
  return [{{ json: {{ estado: 422, cuerpo: {{ error: {{ codigo: 'CURSO_INCOMPLETO', mensaje: 'Al curso le faltan datos para enviarlo a revisión.', detalles }} }} }} }}];
}}
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 240, 0)
    f.unir("Acceso valido", "Comprobar y enviar"); f.unir("Comprobar y enviar", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Comprobar y enviar", "Armar respuesta"], "Comprobar y enviar", "En una sola consulta revisa que el curso esté completo y, si lo está, lo pasa a `en_revision`. Si falta algo: `422 CURSO_INCOMPLETO` con cada falta en `detalles`.")
    f.general("Enviar a revision", "`POST /escuela/enviar-revision` · solo el `instructor` dueño.\n\nEntrada: `{ curso_id }`. Exige título, subtítulo, descripción, nivel, categoría, portada, al menos una sección, ninguna sección vacía y un video `listo` en cada clase. Responde `200 { estado: 'en_revision' }`; un curso que no está en borrador da `409`.")
    f.guardar()


def cursos_en_revision():
    f = Flujo("escCursosRevision01", "Cursos en revision", "GET /escuela/admin/cursos-en-revision. Cursos pendientes de aprobar con sus datos y temario, del más antiguo al más reciente (solo administrador). No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/admin/cursos-en-revision", "administrador", "query", {})
    f.sql("Consultar pendientes", f"""SELECT coalesce(json_agg(t.curso ORDER BY t.antiguedad), '[]'::json) AS cursos FROM (
  SELECT {JSON_CURSO_COMPLETO} AS curso, c.actualizado_en AS antiguedad
  FROM escuela.cursos c LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = c.instructor_id
  WHERE c.estado = 'en_revision'
) t;""", "={{ [] }}", x, 0)
    f.codigo("Armar respuesta", "return [{ json: { estado: 200, cuerpo: { cursos: $input.first().json.cursos } } }];", x + 240, 0)
    f.unir("Entrada valida", "Consultar pendientes"); f.unir("Consultar pendientes", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar pendientes", "Armar respuesta"], "Listar pendientes", "Trae cada curso en `en_revision` con instructor, categoría y temario completo para que el administrador lo revise sin abrir el editor.")
    f.general("Cursos en revision", "`GET /escuela/admin/cursos-en-revision` · solo `administrador`.\n\nAlimenta la pantalla *Revisión*: del que lleva más tiempo esperando al más reciente.")
    f.guardar()


def resolver_revision():
    f = Flujo("escResolverRevision01", "Resolver revision", "POST /escuela/admin/resolver-revision. El administrador aprueba un curso en revisión (lo publica) o lo devuelve a borrador con un comentario obligatorio. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/admin/resolver-revision", "administrador", "body", {
        "curso_id": TEXTO_ID, "aprobar": {"tipo": "booleano"}, "comentario": {"tipo": "texto", "opcional": True, "maximo": 1000, "multilinea": True}})
    f.sql("Aplicar la decision", """WITH c AS (SELECT id, estado FROM escuela.cursos WHERE id = $1::bigint),
permitido AS (SELECT (SELECT estado FROM c) = 'en_revision' AND ($2::boolean OR $3::text IS NOT NULL) AS v),
resuelto AS (
  UPDATE escuela.cursos SET
    estado = CASE WHEN $2::boolean THEN 'publicado' ELSE 'borrador' END,
    comentario_revision = CASE WHEN $2::boolean THEN NULL ELSE $3::text END,
    publicado_en = CASE WHEN $2::boolean THEN now() ELSE publicado_en END,
    actualizado_en = now()
  WHERE id = $1::bigint AND (SELECT v FROM permitido) RETURNING id
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM c) THEN 'no_encontrado'
            WHEN (SELECT estado FROM c) <> 'en_revision' THEN 'estado_invalido'
            WHEN NOT (SELECT v FROM permitido) THEN 'falta_comentario' ELSE 'ok' END AS resultado;""",
          "={{ [$json.datos.curso_id, $json.datos.aprobar, $json.datos.comentario] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
const aprobar = $('Entrada valida').first().json.datos.aprobar;
const error = (estado, codigo, mensaje, detalles) => [{{ json: {{ estado, cuerpo: {{ error: {{ codigo, mensaje, ...(detalles ? {{ detalles }} : {{}}) }} }} }} }}];
if (r.resultado === 'ok') return [{{ json: {{ estado: 200, cuerpo: {{ estado: aprobar ? 'publicado' : 'borrador' }} }} }}];
if (r.resultado === 'no_encontrado') return error(404, 'NO_ENCONTRADO', 'El curso no existe.');
if (r.resultado === 'estado_invalido') return error(409, 'ESTADO_INVALIDO', 'Solo se pueden resolver cursos que están en revisión.');
if (r.resultado === 'falta_comentario') return error(422, 'VALIDACION_FALLIDA', 'Revisa los datos enviados.', [{{ campo: 'comentario', regla: 'obligatorio_si_se_devuelve', mensaje: 'Explica al instructor qué debe cambiar.' }}]);
return error(500, 'ERROR_INTERNO', 'Error interno del servidor.');""", x + 240, 0)
    f.unir("Entrada valida", "Aplicar la decision"); f.unir("Aplicar la decision", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Aplicar la decision", "Armar respuesta"], "Aplicar la decision", "Aprobar publica el curso y fija `publicado_en`. Devolverlo lo regresa a `borrador` con el comentario; sin comentario, `422`. Un curso que no está en revisión da `409`.")
    f.general("Resolver revision", "`POST /escuela/admin/resolver-revision` · solo `administrador`.\n\nEntrada: `{ curso_id, aprobar, comentario? }`. El comentario es obligatorio al devolver y el instructor lo ve en su editor.")
    f.guardar()


def retirar_curso():
    f = Flujo("escRetirarCurso01", "Retirar curso", "POST /escuela/admin/retirar-curso. El administrador retira del catálogo un curso publicado y lo regresa a borrador con un comentario obligatorio. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/admin/retirar-curso", "administrador", "body", {
        "curso_id": TEXTO_ID, "comentario": {"tipo": "texto", "minimo": 1, "maximo": 1000, "multilinea": True}})
    f.sql("Retirar del catalogo", """WITH c AS (SELECT id, estado FROM escuela.cursos WHERE id = $1::bigint),
retirado AS (
  UPDATE escuela.cursos SET estado = 'borrador', comentario_revision = $2::text, actualizado_en = now()
  WHERE id = $1::bigint AND estado = 'publicado' RETURNING id
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM c) THEN 'no_encontrado'
            WHEN EXISTS (SELECT 1 FROM retirado) THEN 'ok' ELSE 'estado_invalido' END AS resultado;""", "={{ [$json.datos.curso_id, $json.datos.comentario] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
const error = (estado, codigo, mensaje) => [{{ json: {{ estado, cuerpo: {{ error: {{ codigo, mensaje }} }} }} }}];
if (r.resultado === 'ok') return [{{ json: {{ estado: 200, cuerpo: {{ estado: 'borrador' }} }} }}];
if (r.resultado === 'no_encontrado') return error(404, 'NO_ENCONTRADO', 'El curso no existe.');
if (r.resultado === 'estado_invalido') return error(409, 'ESTADO_INVALIDO', 'Solo se pueden retirar los cursos publicados.');
return error(500, 'ERROR_INTERNO', 'Error interno del servidor.');""", x + 240, 0)
    f.unir("Entrada valida", "Retirar del catalogo"); f.unir("Retirar del catalogo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Retirar del catalogo", "Armar respuesta"], "Retirar del catalogo", "Solo un curso `publicado` se puede retirar: vuelve a `borrador` con el comentario y desaparece del catálogo.")
    f.general("Retirar curso", "`POST /escuela/admin/retirar-curso` · solo `administrador`.\n\nEntrada: `{ curso_id, comentario }`. Responde `200 { estado: 'borrador' }`.")
    f.guardar()


PORTADA_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
STORAGE = "http://storage:5000"


def url_subida_portada():
    f = Flujo("escUrlSubidaPortada01", "URL de subida de portada", "POST /escuela/url-subida-portada. Valida tipo y tamaño de la imagen y pide a Supabase Storage una URL firmada de un solo uso para que el navegador suba la portada directo (instructor dueño; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/url-subida-portada", "instructor", "body", {
        "curso_id": TEXTO_ID, "tipo_contenido": {"tipo": "texto", "minimo": 1, "maximo": 100}, "tamano_bytes": {"tipo": "entero", "minimo": 1, "maximo": 1000000000}},
        {"modo": "dueno", "editable": True, "tipo": "curso", "campo": "curso_id"})
    f.codigo("Revisar portada", f"""const e = $input.first().json;
const d = e.datos;
const EXT = {json.dumps(PORTADA_MIME)};
const error = (mensaje) => [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'PORTADA_INVALIDA', mensaje }} }} }} }}];
if (!EXT[d.tipo_contenido]) return error('La portada debe ser una imagen JPG, PNG o WebP.');
if (d.tamano_bytes > 2097152) return error('La portada no puede pesar más de 2 MB.');
const azar = Array.from({{ length: 16 }}, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
return [{{ json: {{ ok: true, ruta: `cursos/${{e.curso.id}}/portada-${{azar}}.${{EXT[d.tipo_contenido]}}` }} }}];""", x, 0)
    f.si("Portada valida", "={{ $json.ok }}", x + 240, 0)
    f.http("Firmar subida en Storage", "POST", f"={STORAGE}/object/upload/sign/portadas/{{{{ $json.ruta }}}}", {}, x + 480, 0, servicio=True)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
const ruta = $('Revisar portada').first().json.ruta;
if (r.statusCode === 200 && r.body && r.body.url) return [{{ json: {{ estado: 200, cuerpo: {{ url_subida: `/almacen${{r.body.url}}`, ruta }} }} }}];
return [{{ json: {{ estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 720, 0)
    f.unir("Acceso valido", "Revisar portada"); f.unir("Revisar portada", "Portada valida")
    f.unir("Portada valida", "Firmar subida en Storage", 0); f.unir("Portada valida", "Responder", 1)
    f.unir("Firmar subida en Storage", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Revisar el archivo", "Solo `image/jpeg`, `image/png` o `image/webp` de hasta 2 MB (2 097 152 bytes); si no, `422 PORTADA_INVALIDA`. Genera la ruta `cursos/<id>/portada-<azar>.<ext>`.", NOTA_ENTRADA,
              ["Revisar portada", "Portada valida"], True, "Valida tipo y tamaño y arma la ruta del archivo.")
    cierre(f, x + 960, ["Firmar subida en Storage", "Armar respuesta"], "Firmar la subida", "Pide a `storage:5000` (credencial de rol de servicio) una URL firmada de un solo uso. El archivo lo sube el navegador, nunca pasa por n8n.", NOTA_PERMISOS, "Pide a Storage la URL firmada de subida.")
    f.general("URL de subida de portada", "`POST /escuela/url-subida-portada` · solo el `instructor` dueño.\n\nEntrada: `{ curso_id, tipo_contenido, tamano_bytes }`. Responde `{ url_subida, ruta }`; el navegador hace `PUT` del archivo a `url_subida` y luego llama a *Confirmar portada*.")
    f.guardar()


def confirmar_portada():
    f = Flujo("escConfirmarPortada01", "Confirmar portada", "POST /escuela/confirmar-portada. Comprueba en Storage que la portada se subió, la guarda en el curso y borra la anterior (instructor dueño; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/confirmar-portada", "instructor", "body", {"curso_id": TEXTO_ID, "ruta": {"tipo": "texto", "minimo": 1, "maximo": 200}},
                  {"modo": "dueno", "editable": True, "tipo": "curso", "campo": "curso_id"})
    f.codigo("Revisar ruta", f"""const e = $input.first().json;
const valida = new RegExp(`^cursos/${{e.curso.id}}/portada-[0-9a-f]{{32}}\\\\.(jpg|png|webp)$`).test(e.datos.ruta);
if (!valida) return [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'PORTADA_INVALIDA', mensaje: 'La ruta de la portada no corresponde a este curso.' }} }} }} }}];
return [{{ json: {{ ok: true, ruta: e.datos.ruta }} }}];""", x, 0)
    f.si("Ruta valida", "={{ $json.ok }}", x + 240, 0)
    f.http("Consultar archivo en Storage", "GET", f"={STORAGE}/object/info/portadas/{{{{ $json.ruta }}}}", {}, x + 480, 0, servicio=True)
    f.codigo("Clasificar archivo", f"""const r = $input.first().json;
const b = r.body || {{}};
const tipo = (b.content_type || (b.metadata || {{}}.mimetype) || '');
const tamano = Number(b.size || (b.metadata || {{}}).size || 0);
if (r.statusCode !== 200) return [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'PORTADA_INVALIDA', mensaje: 'La portada todavía no se subió.' }} }} }} }}];
if (!{json.dumps(list(PORTADA_MIME))}.includes(tipo) || tamano > 2097152) return [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'PORTADA_INVALIDA', mensaje: 'La portada debe ser una imagen JPG, PNG o WebP de hasta 2 MB.' }} }} }} }}];
return [{{ json: {{ ok: true }} }}];""", x + 720, 0)
    f.si("Archivo valido", "={{ $json.ok }}", x + 960, 0)
    f.sql("Guardar portada", """WITH anterior AS (SELECT portada_ruta FROM escuela.cursos WHERE id = $1::bigint),
nueva AS (UPDATE escuela.cursos SET portada_ruta = $2::text, actualizado_en = now() WHERE id = $1::bigint RETURNING id)
SELECT (SELECT portada_ruta FROM anterior) AS anterior, EXISTS (SELECT 1 FROM nueva) AS guardada;""",
          "={{ [$('Acceso valido').first().json.curso.id, $('Revisar ruta').first().json.ruta] }}", x + 1200, 0)
    f.http("Borrar portada anterior", "DELETE", f"={STORAGE}/object/portadas/{{{{ $json.anterior || 'sin-portada-anterior' }}}}", {}, x + 1440, 0, servicio=True)
    f.codigo("Armar respuesta", f"""const ruta = $('Revisar ruta').first().json.ruta;
if (!$('Guardar portada').first().json.guardada) return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'El curso no existe.' }} }} }} }}];
return [{{ json: {{ estado: 200, cuerpo: {{ portada_url: `/almacen/object/public/portadas/${{ruta}}` }} }} }}];""", x + 1680, 0)
    f.unir("Acceso valido", "Revisar ruta"); f.unir("Revisar ruta", "Ruta valida")
    f.unir("Ruta valida", "Consultar archivo en Storage", 0); f.unir("Ruta valida", "Responder", 1)
    f.unir("Consultar archivo en Storage", "Clasificar archivo"); f.unir("Clasificar archivo", "Archivo valido")
    f.unir("Archivo valido", "Guardar portada", 0); f.unir("Archivo valido", "Responder", 1)
    f.unir("Guardar portada", "Borrar portada anterior"); f.unir("Borrar portada anterior", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Revisar la ruta", "La ruta debe ser `cursos/<id del curso>/portada-<32 hex>.<jpg|png|webp>`: nadie puede apuntar a un archivo de otro curso.", NOTA_ENTRADA,
              ["Revisar ruta", "Ruta valida"], True, "Comprueba que la ruta pertenece a este curso.")
    f.seccion("Comprobar en Storage", "Pregunta a Storage por el archivo (`/object/info`): si no existe, o no es JPG/PNG/WebP de hasta 2 MB, `422 PORTADA_INVALIDA`.", NOTA_PERMISOS,
              ["Consultar archivo en Storage", "Clasificar archivo", "Archivo valido"], True, "Comprueba que el archivo se subió y cumple los límites.")
    cierre(f, x + 1920, ["Guardar portada", "Borrar portada anterior", "Armar respuesta"], "Guardar y limpiar", "Guarda la ruta en el curso y borra la portada anterior del bucket (si no había, el borrado responde 404 y se ignora). Devuelve `{ portada_url }`.")
    f.general("Confirmar portada", "`POST /escuela/confirmar-portada` · solo el `instructor` dueño.\n\nEntrada: `{ curso_id, ruta }`, la `ruta` que devolvió *URL de subida de portada*. Responde `200 { portada_url }`.")
    f.guardar()


def cursos_catalogo():
    f = Flujo("escCursos01", "Cursos", "GET /escuela/cursos?q=&categoria=&nivel=&pagina=. Catálogo público de cursos publicados con búsqueda de texto completo en español (sin acentos), filtros y 12 cursos por página. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/cursos", None, "query", {
        "q": {"tipo": "texto", "opcional": True, "maximo": 100}, "categoria": {"tipo": "texto", "opcional": True, "maximo": 80},
        "nivel": {"tipo": "opcion", "opcional": True, "valores": ["basico", "intermedio", "avanzado"]},
        "pagina": {"tipo": "entero", "opcional": True, "minimo": 1, "maximo": 10000}})
    f.sql("Buscar cursos", """WITH p AS (
  SELECT NULLIF($1::text, '') AS q, NULLIF($2::text, '') AS categoria, NULLIF($3::text, '') AS nivel, coalesce($4::int, 1) AS pagina,
         CASE WHEN NULLIF($1::text, '') IS NULL THEN NULL ELSE websearch_to_tsquery('spanish', escuela.sin_acentos($1::text)) END AS consulta
), filtrados AS (
  SELECT c.id, c.slug, c.titulo, c.subtitulo, c.nivel, c.portada_ruta, c.publicado_en,
         cat.nombre AS categoria, cat.slug AS categoria_slug, coalesce(i.nombre_publico, 'Instructor') AS instructor,
         (SELECT count(*) FROM escuela.secciones s WHERE s.curso_id = c.id) AS secciones,
         (SELECT count(*) FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE s.curso_id = c.id) AS clases,
         CASE WHEN p.consulta IS NULL THEN 0 ELSE ts_rank(c.busqueda, p.consulta) END AS relevancia
  FROM escuela.cursos c
  LEFT JOIN escuela.categorias cat ON cat.id = c.categoria_id
  LEFT JOIN escuela.perfiles_instructor i ON i.usuario_id = c.instructor_id
  CROSS JOIN p
  WHERE c.estado = 'publicado'
    AND (p.categoria IS NULL OR cat.slug = p.categoria)
    AND (p.nivel IS NULL OR c.nivel = p.nivel)
    AND (p.consulta IS NULL OR c.busqueda @@ p.consulta
         OR to_tsvector('spanish', escuela.sin_acentos(coalesce(i.nombre_publico, ''))) @@ p.consulta)
)
SELECT (SELECT count(*) FROM filtrados)::int AS total, (SELECT pagina FROM p) AS pagina,
  coalesce((SELECT json_agg(json_build_object('slug', t.slug, 'titulo', t.titulo, 'subtitulo', t.subtitulo, 'nivel', t.nivel,
              'categoria', t.categoria, 'categoria_slug', t.categoria_slug, 'instructor', t.instructor, 'portada_ruta', t.portada_ruta,
              'secciones', t.secciones, 'clases', t.clases) ORDER BY t.relevancia DESC, t.publicado_en DESC, t.id DESC)
            FROM (SELECT * FROM filtrados ORDER BY relevancia DESC, publicado_en DESC, id DESC
                  OFFSET ((SELECT pagina FROM p) - 1) * 12 LIMIT 12) t), '[]'::json) AS cursos;""",
          "={{ [$json.datos.q, $json.datos.categoria, $json.datos.nivel, $json.datos.pagina] }}", x, 0)
    f.codigo("Armar respuesta", "const r = $input.first().json;\nreturn [{ json: { estado: 200, cuerpo: { cursos: r.cursos, total: r.total, pagina: r.pagina, paginas: Math.ceil(r.total / 12) } } }];", x + 240, 0)
    f.unir("Entrada valida", "Buscar cursos"); f.unir("Buscar cursos", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Buscar cursos", "Armar respuesta"], "Buscar y paginar", "Solo cursos `publicado`. La búsqueda ignora acentos y mayúsculas, usa raíces del español y mira título, subtítulo, descripción y nombre del instructor; ordena por relevancia y luego por fecha. 12 por página.")
    f.general("Cursos", "`GET /escuela/cursos?q=&categoria=&nivel=&pagina=` · público, sin sesión.\n\nResponde `{ cursos, total, pagina, paginas }`. Cada tarjeta trae título, subtítulo, nivel, categoría, instructor, portada y cuántas secciones y clases tiene; nunca datos internos.")
    f.guardar()


def curso_publico():
    f = Flujo("escCursoPublico01", "Curso publico", "GET /escuela/curso?slug=. Ficha pública de un curso publicado con su temario completo (sin video y sin campos internos). No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/curso", None, "query", {"slug": {"tipo": "texto", "minimo": 1, "maximo": 120}})
    f.sql("Consultar la ficha", """SELECT json_build_object(
  'id', c.id, 'slug', c.slug, 'titulo', c.titulo, 'subtitulo', c.subtitulo, 'descripcion', c.descripcion,
  'conocimientos_previos', c.conocimientos_previos, 'lo_que_aprenderas', c.lo_que_aprenderas, 'nivel', c.nivel,
  'categoria', CASE WHEN cat.id IS NULL THEN NULL ELSE json_build_object('nombre', cat.nombre, 'slug', cat.slug) END,
  'portada_ruta', c.portada_ruta, 'instructor', coalesce(i.nombre_publico, 'Instructor'), 'publicado_en', c.publicado_en,
  'secciones', coalesce((
    SELECT json_agg(json_build_object('id', s.id, 'titulo', s.titulo, 'posicion', s.posicion, 'clases', coalesce((
      SELECT json_agg(json_build_object('id', k.id, 'titulo', k.titulo, 'descripcion', k.descripcion,
             'duracion_estimada_minutos', k.duracion_estimada_minutos, 'es_muestra', k.es_muestra, 'posicion', k.posicion) ORDER BY k.posicion)
      FROM escuela.clases k WHERE k.seccion_id = s.id), '[]'::json)) ORDER BY s.posicion)
    FROM escuela.secciones s WHERE s.curso_id = c.id), '[]'::json)) AS curso
FROM escuela.cursos c
LEFT JOIN escuela.categorias cat ON cat.id = c.categoria_id
LEFT JOIN escuela.perfiles_instructor i ON i.usuario_id = c.instructor_id
WHERE c.slug = $1::text AND c.estado = 'publicado';""", "={{ [$json.datos.slug] }}", x, 0)
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
if (r.curso) return [{{ json: {{ estado: 200, cuerpo: r.curso }} }}];
return [{{ json: {{ estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'El curso no existe.' }} }} }} }}];""", x + 240, 0)
    f.unir("Entrada valida", "Consultar la ficha"); f.unir("Consultar la ficha", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar la ficha", "Armar respuesta"], "Leer la ficha", "Un curso que no está `publicado` responde `404`, igual que uno que no existe. Lleva `es_muestra` y la duración de cada clase, pero ningún video ni dato interno.")
    f.general("Curso publico", "`GET /escuela/curso?slug=` · público, sin sesión.\n\nAlimenta la ficha `/curso?c=<slug>`. No devuelve `instructor_id`, `estado`, `comentario_revision` ni correos.")
    f.guardar()


PLANTILLA_INVITACION = (Path(__file__).resolve().parent.parent / "plantillas" / "invitacion_equipo.html").read_text(encoding="utf-8")


def invitar_equipo():
    f = Flujo("escInvitarEquipo01", "Invitar al equipo", "POST /escuela/invitar-equipo. El instructor invita por correo a una cuenta ya registrada y verificada a su equipo de apoyo; el invitado recibe un aviso sin enlaces y responde en su panel. La invitación vence a los 7 días. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/invitar-equipo", "instructor", "body", {"correo": {"tipo": "correo"}})
    f.subflujo("Buscar cuenta por correo", "escBuscarCuenta01", x, 0)
    f.codigo("Revisar invitado", f"""const c = $input.first().json;
const yo = $('Entrada valida').first().json.usuario.id;
const error = (estado, codigo, mensaje) => [{{ json: {{ ok: false, estado, cuerpo: {{ error: {{ codigo, mensaje }} }} }} }}];
if (!c.ok && c.estado === 404) return error(404, 'USUARIO_NO_REGISTRADO', 'Ese correo no tiene una cuenta registrada.');
if (!c.ok) return [{{ json: c }}];
if (!c.verificado) return error(404, 'USUARIO_NO_REGISTRADO', 'Esa cuenta todavía no verificó su correo.');
if (c.id === yo) return error(409, 'ESTADO_INVALIDO', 'No puedes invitarte a ti mismo.');
return [{{ json: {{ ok: true, miembro_id: c.id, correo: c.correo }} }}];""", x + 240, 0)
    f.si("Invitado valido", "={{ $json.ok }}", x + 480, 0)
    f.sql("Cerrar invitaciones caducadas", "UPDATE escuela.invitaciones_equipo SET estado = 'cancelada', respondida_en = now() WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en < now() RETURNING id;",
          "={{ [$('Entrada valida').first().json.usuario.id, $json.miembro_id] }}", x + 720, 0)
    f.sql("Crear la invitacion", """WITH miembro AS (SELECT 1 FROM escuela.equipos_apoyo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid),
vigente AS (SELECT 1 FROM escuela.invitaciones_equipo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en >= now()),
nueva AS (
  INSERT INTO escuela.invitaciones_equipo (instructor_id, miembro_id, correo)
  SELECT $1::uuid, $2::uuid, $3::text WHERE NOT EXISTS (SELECT 1 FROM miembro) AND NOT EXISTS (SELECT 1 FROM vigente) RETURNING id, expira_en
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM miembro) THEN 'ya_es_miembro' WHEN EXISTS (SELECT 1 FROM vigente) THEN 'duplicada' ELSE 'ok' END AS resultado,
       (SELECT id FROM nueva) AS id, (SELECT expira_en FROM nueva) AS expira_en,
       coalesce((SELECT nombre_publico FROM escuela.perfiles_instructor WHERE usuario_id = $1::uuid), 'Un instructor') AS instructor;""",
          "={{ [$('Entrada valida').first().json.usuario.id, $('Revisar invitado').first().json.miembro_id, $('Revisar invitado').first().json.correo] }}", x + 960, 0)
    f.codigo("Clasificar invitacion", f"""const r = $input.first().json;
const error = (estado, codigo, mensaje) => [{{ json: {{ ok: false, estado, cuerpo: {{ error: {{ codigo, mensaje }} }} }} }}];
if (r.resultado === 'ya_es_miembro') return error(409, 'YA_ES_MIEMBRO', 'Esa persona ya está en tu equipo.');
if (r.resultado === 'duplicada') return error(409, 'INVITACION_DUPLICADA', 'Ya hay una invitación pendiente para esa persona.');
if (r.resultado !== 'ok') return error(500, 'ERROR_INTERNO', 'Error interno del servidor.');
return [{{ json: {{ ok: true, id: Number(r.id), expira_en: r.expira_en, instructor: r.instructor }} }}];""", x + 1200, 0)
    f.si("Invitacion creada", "={{ $json.ok }}", x + 1440, 0)
    f.codigo("Armar correo", f"""const PLANTILLA = {json.dumps(PLANTILLA_INVITACION, ensure_ascii=False)};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }})[c]);
const i = $input.first().json;
const limite = new Date(i.expira_en).toLocaleDateString('es-MX', {{ day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' }});
const html = PLANTILLA.replaceAll('{{{{nombre_instructor}}}}', esc(i.instructor)).replaceAll('{{{{fecha_limite}}}}', esc(limite));
return [{{ json: {{ para: $('Revisar invitado').first().json.correo, asunto: `${{i.instructor}} te invitó a su equipo de apoyo`, html }} }}];""", x + 1680, 0)
    f.nodo("Enviar correo", "n8n-nodes-base.emailSend", 2.1,
           {"resource": "email", "operation": "send", "fromEmail": "Medical School <no-responder@escuela.local>", "toEmail": "={{ $json.para }}",
            "subject": "={{ $json.asunto }}", "emailFormat": "html", "html": "={{ $json.html }}", "options": {"appendAttribution": False}}, x + 1920, 0,
           credentials={"smtp": {"id": "smtpMailpit01", "name": "SMTP Mailpit"}}, onError="continueRegularOutput")
    f.codigo("Armar respuesta", "const c = $('Clasificar invitacion').first().json;\nconst enviado = !$input.first().json.error;\nreturn [{ json: { estado: 201, cuerpo: { id: c.id, expira_en: c.expira_en, correo_enviado: enviado } } }];", x + 2160, 0)
    f.unir("Entrada valida", "Buscar cuenta por correo"); f.unir("Buscar cuenta por correo", "Revisar invitado"); f.unir("Revisar invitado", "Invitado valido")
    f.unir("Invitado valido", "Cerrar invitaciones caducadas", 0); f.unir("Invitado valido", "Responder", 1)
    f.unir("Cerrar invitaciones caducadas", "Crear la invitacion"); f.unir("Crear la invitacion", "Clasificar invitacion"); f.unir("Clasificar invitacion", "Invitacion creada")
    f.unir("Invitacion creada", "Armar correo", 0); f.unir("Invitacion creada", "Responder", 1)
    f.unir("Armar correo", "Enviar correo"); f.unir("Enviar correo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Buscar al invitado", "Subworkflow `Buscar cuenta por correo`. Solo se invita a cuentas **registradas y verificadas** (`404 USUARIO_NO_REGISTRADO`); nadie se invita a sí mismo (`409`).", NOTA_PERMISOS,
              ["Buscar cuenta por correo", "Revisar invitado", "Invitado valido"], True, "Comprueba que el invitado tenga cuenta verificada.")
    f.seccion("Crear la invitacion", "Primero cierra las invitaciones vencidas de esa persona (así se puede reinvitar) y luego inserta la nueva con vigencia de 7 días. Ya miembro: `409 YA_ES_MIEMBRO`; ya invitado: `409 INVITACION_DUPLICADA`.", NOTA_DATOS,
              ["Cerrar invitaciones caducadas", "Crear la invitacion", "Clasificar invitacion", "Invitacion creada"], True, "Cierra las caducadas y crea la invitación vigente.")
    f.seccion("Avisar por correo", "La plantilla `escuela/plantillas/invitacion_equipo.html` va en español y **sin enlaces**: solo avisa. El nombre se escapa para HTML. Si el SMTP falla la invitación igual queda creada (`correo_enviado: false`).", NOTA_RESPUESTA,
              ["Armar correo", "Enviar correo", "Armar respuesta"], True, "Envía el aviso por SMTP (Mailpit en local) y arma el 201.")
    f.responder(x + 2400, 0)
    f.seccion("Respuesta", "Devuelve el `201` o el error de cualquier paso anterior.", NOTA_RESPUESTA, ["Responder"])
    f.general("Invitar al equipo", "`POST /escuela/invitar-equipo` · solo `instructor`.\n\nEntrada: `{ correo }`. Responde `201 { id, expira_en, correo_enviado }`. El invitado acepta o rechaza en su panel (*Responder invitacion*); no hay enlaces ni códigos en el correo.")
    f.guardar()


def mi_equipo():
    f = Flujo("escMiEquipo01", "Mi equipo", "GET /escuela/mi-equipo. Miembros del equipo de apoyo del instructor e invitaciones pendientes vigentes. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/mi-equipo", "instructor", "query", {})
    f.sql("Consultar equipo", """SELECT
  coalesce((SELECT json_agg(json_build_object('miembro_id', e.miembro_id, 'desde', e.creado_en,
      'correo', (SELECT i.correo FROM escuela.invitaciones_equipo i WHERE i.instructor_id = e.instructor_id AND i.miembro_id = e.miembro_id AND i.estado = 'aceptada' ORDER BY i.respondida_en DESC LIMIT 1)) ORDER BY e.creado_en)
    FROM escuela.equipos_apoyo e WHERE e.instructor_id = $1::uuid), '[]'::json) AS miembros,
  coalesce((SELECT json_agg(json_build_object('id', i.id, 'correo', i.correo, 'expira_en', i.expira_en) ORDER BY i.creado_en DESC)
    FROM escuela.invitaciones_equipo i WHERE i.instructor_id = $1::uuid AND i.estado = 'pendiente' AND i.expira_en >= now()), '[]'::json) AS invitaciones;""", "={{ [$json.usuario.id] }}", x, 0)
    f.codigo("Armar respuesta", "const r = $input.first().json;\nreturn [{ json: { estado: 200, cuerpo: { miembros: r.miembros, invitaciones: r.invitaciones } } }];", x + 240, 0)
    f.unir("Entrada valida", "Consultar equipo"); f.unir("Consultar equipo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar equipo", "Armar respuesta"], "Leer el equipo", "Miembros (con el correo con el que aceptaron) e invitaciones `pendiente` que todavía no vencen.")
    f.general("Mi equipo", "`GET /escuela/mi-equipo` · solo `instructor`.\n\nAlimenta la pantalla *Mi equipo de apoyo*.")
    f.guardar()


def cancelar_invitacion():
    f = Flujo("escCancelarInvitacion01", "Cancelar invitacion", "POST /escuela/cancelar-invitacion. El instructor cancela una invitación pendiente suya. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/cancelar-invitacion", "instructor", "body", {"invitacion_id": TEXTO_ID})
    f.sql("Cancelar", "UPDATE escuela.invitaciones_equipo SET estado = 'cancelada', respondida_en = now() WHERE id = $1::bigint AND instructor_id = $2::uuid AND estado = 'pendiente' RETURNING id;",
          "={{ [$json.datos.invitacion_id, $json.usuario.id] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.id) return [{ json: { estado: 204, cuerpo: null } }];", "La invitación pendiente")
    f.unir("Entrada valida", "Cancelar"); f.unir("Cancelar", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Cancelar", "Armar respuesta"], "Cancelar la invitacion", "Solo cancela invitaciones `pendiente` del propio instructor; si no existe o ya se respondió, `404`.")
    f.general("Cancelar invitacion", "`POST /escuela/cancelar-invitacion` · solo `instructor`.\n\nEntrada: `{ invitacion_id }`. Responde `204`.")
    f.guardar()


def quitar_miembro():
    f = Flujo("escQuitarMiembro01", "Quitar miembro", "POST /escuela/quitar-miembro. El instructor quita a alguien de su equipo de apoyo; si no pertenece a otro equipo pierde el rol equipo_apoyo. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/quitar-miembro", "instructor", "body", {"miembro_id": {"tipo": "uuid"}})
    f.sql("Quitar del equipo", """WITH quitado AS (DELETE FROM escuela.equipos_apoyo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid RETURNING miembro_id),
rol AS (
  DELETE FROM escuela.roles_usuario WHERE usuario_id = $2::uuid AND rol = 'equipo_apoyo' AND EXISTS (SELECT 1 FROM quitado)
    AND NOT EXISTS (SELECT 1 FROM escuela.equipos_apoyo WHERE miembro_id = $2::uuid AND instructor_id <> $1::uuid) RETURNING 1
)
SELECT EXISTS (SELECT 1 FROM quitado) AS quitado;""", "={{ [$json.usuario.id, $json.datos.miembro_id] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.quitado) return [{ json: { estado: 204, cuerpo: null } }];", "El miembro")
    f.unir("Entrada valida", "Quitar del equipo"); f.unir("Quitar del equipo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Quitar del equipo", "Armar respuesta"], "Quitar del equipo", "Borra la pertenencia y, si la persona no está en el equipo de otro instructor, le quita el rol `equipo_apoyo`. Pierde el acceso al temario de inmediato.")
    f.general("Quitar miembro", "`POST /escuela/quitar-miembro` · solo `instructor`.\n\nEntrada: `{ miembro_id }`. Responde `204`.")
    f.guardar()


def mis_invitaciones():
    f = Flujo("escMisInvitaciones01", "Mis invitaciones", "GET /escuela/mis-invitaciones. Invitaciones a equipos de apoyo pendientes y vigentes de la cuenta con sesión. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/mis-invitaciones", "cualquiera", "query", {})
    f.sql("Consultar invitaciones", """SELECT coalesce(json_agg(json_build_object('id', i.id, 'instructor', coalesce(p.nombre_publico, 'Un instructor'), 'creado_en', i.creado_en, 'expira_en', i.expira_en) ORDER BY i.creado_en DESC), '[]'::json) AS invitaciones
FROM escuela.invitaciones_equipo i LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = i.instructor_id
WHERE i.miembro_id = $1::uuid AND i.estado = 'pendiente' AND i.expira_en >= now();""", "={{ [$json.usuario.id] }}", x, 0)
    f.codigo("Armar respuesta", "return [{ json: { estado: 200, cuerpo: { invitaciones: $input.first().json.invitaciones } } }];", x + 240, 0)
    f.unir("Entrada valida", "Consultar invitaciones"); f.unir("Consultar invitaciones", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar invitaciones", "Armar respuesta"], "Leer invitaciones", "Solo las `pendiente` cuyo `expira_en` no ha pasado: una invitación vencida deja de aparecer.")
    f.general("Mis invitaciones", "`GET /escuela/mis-invitaciones` · cualquier cuenta con sesión.\n\nAlimenta la sección *Invitaciones* del panel.")
    f.guardar()


def responder_invitacion():
    f = Flujo("escResponderInvitacion01", "Responder invitacion", "POST /escuela/responder-invitacion. La persona invitada acepta (entra al equipo y recibe el rol equipo_apoyo) o rechaza una invitación pendiente y vigente. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/responder-invitacion", "cualquiera", "body", {"invitacion_id": TEXTO_ID, "aceptar": {"tipo": "booleano"}})
    f.sql("Aplicar la respuesta", """WITH inv AS (SELECT * FROM escuela.invitaciones_equipo WHERE id = $1::bigint AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en >= now()),
resp AS (
  UPDATE escuela.invitaciones_equipo SET estado = CASE WHEN $3::boolean THEN 'aceptada' ELSE 'rechazada' END, respondida_en = now()
  WHERE id IN (SELECT id FROM inv) RETURNING id
), equipo AS (
  INSERT INTO escuela.equipos_apoyo (instructor_id, miembro_id) SELECT instructor_id, miembro_id FROM inv WHERE $3::boolean ON CONFLICT DO NOTHING RETURNING 1
), rol AS (
  INSERT INTO escuela.roles_usuario (usuario_id, rol) SELECT miembro_id, 'equipo_apoyo' FROM inv WHERE $3::boolean ON CONFLICT DO NOTHING RETURNING 1
)
SELECT EXISTS (SELECT 1 FROM resp) AS respondida;""", "={{ [$json.datos.invitacion_id, $json.usuario.id, $json.datos.aceptar] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.respondida) return [{ json: { estado: 200, cuerpo: { aceptada: $('Entrada valida').first().json.datos.aceptar } } }];", "La invitación")
    f.unir("Entrada valida", "Aplicar la respuesta"); f.unir("Aplicar la respuesta", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Aplicar la respuesta", "Armar respuesta"], "Aplicar la respuesta", "Solo responde quien fue invitado, y solo si la invitación sigue `pendiente` y vigente. Aceptar crea la pertenencia y el rol `equipo_apoyo` en la misma consulta.")
    f.general("Responder invitacion", "`POST /escuela/responder-invitacion` · cualquier cuenta con sesión (la invitación debe ser suya).\n\nEntrada: `{ invitacion_id, aceptar }`. Responde `200 { aceptada }`; una invitación ajena, vencida o ya respondida da `404`.")
    f.guardar()


VIDEO_MIME = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}
VIDEO_MAX_BYTES = 1073741824


def solicitar_subida_video():
    f = Flujo("escSolicitarSubidaVideo01", "Solicitar subida de video", "POST /escuela/solicitar-subida-video. Valida tipo y tamaño, reserva la ruta ordenada del video, genera su clave AES-128 y firma una subida directa a Supabase Storage (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/solicitar-subida-video", ROLES_TEMARIO, "body", {
        "clase_id": TEXTO_ID, "nombre_archivo": {"tipo": "texto", "minimo": 1, "maximo": 255},
        "tipo_contenido": {"tipo": "texto", "minimo": 1, "maximo": 100}, "tamano_bytes": {"tipo": "entero", "minimo": 1, "maximo": 1000000000000}},
        {"modo": "dueno_o_equipo", "editable": True, "tipo": "clase", "campo": "clase_id"})
    f.codigo("Revisar video", f"""const d = $input.first().json.datos;
const EXT = {json.dumps(VIDEO_MIME)};
const error = (mensaje) => [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'VIDEO_INVALIDO', mensaje }} }} }} }}];
if (!EXT[d.tipo_contenido]) return error('El video debe ser MP4, MOV o WebM.');
if (d.tamano_bytes > {VIDEO_MAX_BYTES}) return error('El video no puede pesar más de 1 GiB.');
return [{{ json: {{ ok: true, extension: EXT[d.tipo_contenido] }} }}];""", x, 0)
    f.si("Video valido", "={{ $json.ok }}", x + 240, 0)
    f.sql("Reservar ruta", """SELECT nextval(pg_get_serial_sequence('escuela.videos_clase', 'id')) AS id,
       'cursos/' || s.curso_id || '/secciones/' || s.id || '/clases/' || k.id AS carpeta_clase
FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE k.id = $1::bigint;""", "={{ [$('Acceso valido').first().json.datos.clase_id] }}", x + 480, 0)
    f.codigo("Armar rutas", f"""const r = $input.first().json;
if (!r.id) return [{{ json: {{ ok: false, estado: 404, cuerpo: {{ error: {{ codigo: 'NO_ENCONTRADO', mensaje: 'La clase no existe.' }} }} }} }}];
const base = `${{r.carpeta_clase}}/${{r.id}}`;
return [{{ json: {{ ok: true, video_id: Number(r.id), ruta_base: base, ruta_original: `${{base}}/original.${{$('Revisar video').first().json.extension}}` }} }}];""", x + 720, 0)
    f.http("Firmar subida en Storage", "POST", f"={STORAGE}/object/upload/sign/videos/{{{{ $json.ruta_original }}}}", {}, x + 960, 0, servicio=True)
    f.codigo("Clasificar firma", f"""const r = $input.first().json;
if (r.statusCode === 200 && r.body && r.body.url) return [{{ json: {{ ok: true, url_subida: `/almacen${{r.body.url}}` }} }}];
return [{{ json: {{ ok: false, estado: 500, cuerpo: {ERROR_INTERNO_JS} }} }}];""", x + 1200, 0)
    f.si("Firma valida", "={{ $json.ok }}", x + 1440, 0)
    f.sql("Registrar video", """WITH nuevo AS (
  INSERT INTO escuela.videos_clase (id, clase_id, estado, nombre_original, tipo_contenido, tamano_bytes, ruta_base)
  VALUES ($5::bigint, $1::bigint, 'esperando_archivo', $2::text, $3::text, $4::bigint, $6::text)
  ON CONFLICT DO NOTHING RETURNING id
), clave AS (
  INSERT INTO escuela.claves_video (video_id, clave) SELECT id, gen_random_bytes(16) FROM nuevo RETURNING video_id
)
SELECT EXISTS (SELECT 1 FROM nuevo) AS registrado;""",
          "={{ [$('Acceso valido').first().json.datos.clase_id, $('Acceso valido').first().json.datos.nombre_archivo, $('Acceso valido').first().json.datos.tipo_contenido, $('Acceso valido').first().json.datos.tamano_bytes, $('Armar rutas').first().json.video_id, $('Armar rutas').first().json.ruta_base] }}", x + 1680, 0)
    f.codigo("Armar respuesta", f"""const p = $('Armar rutas').first().json;
if ($input.first().json.registrado) return [{{ json: {{ estado: 201, cuerpo: {{ video_id: p.video_id, url_subida: $('Clasificar firma').first().json.url_subida, ruta: p.ruta_original }} }} }}];
return [{{ json: {{ estado: 409, cuerpo: {{ error: {{ codigo: 'VIDEO_EN_PROCESO', mensaje: 'Esta clase ya tiene un video subiéndose o procesándose.' }} }} }} }}];""", x + 1920, 0)
    f.unir("Acceso valido", "Revisar video"); f.unir("Revisar video", "Video valido")
    f.unir("Video valido", "Reservar ruta", 0); f.unir("Video valido", "Responder", 1)
    f.unir("Reservar ruta", "Armar rutas"); f.unir("Armar rutas", "Firmar subida en Storage")
    f.unir("Firmar subida en Storage", "Clasificar firma"); f.unir("Clasificar firma", "Firma valida")
    f.unir("Firma valida", "Registrar video", 0); f.unir("Firma valida", "Responder", 1)
    f.unir("Registrar video", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Revisar el archivo", "Solo `video/mp4`, `video/quicktime` o `video/webm` de hasta 1 GiB (1 073 741 824 bytes); si no, `422 VIDEO_INVALIDO`.", NOTA_ENTRADA,
              ["Revisar video", "Video valido"], True, "Valida el tipo y el tamaño declarados del video.")
    f.seccion("Preparar y firmar", "Reserva el id del video y arma la ruta ordenada `cursos/<c>/secciones/<s>/clases/<k>/<video>/` y pide a Storage una URL firmada de un solo uso.", NOTA_PERMISOS,
              ["Reservar ruta", "Armar rutas", "Firmar subida en Storage", "Clasificar firma", "Firma valida"], True, "Reserva la ruta, genera la clave y firma la subida.")
    f.responder(x + 2160, 0)
    f.seccion("Registrar el video", "Guarda el video en `esperando_archivo` junto con su clave AES-128 (16 bytes de `gen_random_bytes`, en una tabla aparte). Si la clase ya tiene un video subiéndose o procesándose, la base lo impide: `409 VIDEO_EN_PROCESO`. La clave **nunca** sale en la respuesta.", NOTA_DATOS,
              ["Registrar video", "Armar respuesta"], True, "Registra el video y su clave; un segundo video en proceso da 409.")
    f.seccion("Respuesta", "Devuelve `201 { video_id, url_subida, ruta }` o el error de cualquier paso anterior.", NOTA_RESPUESTA, ["Responder"])
    f.general("Solicitar subida de video", "`POST /escuela/solicitar-subida-video` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ clase_id, nombre_archivo, tipo_contenido, tamano_bytes }`. El navegador hace `PUT` del archivo a `url_subida` (directo a Storage, nunca pasa por n8n) y después llama a *Confirmar subida de video*.")
    f.guardar()


def encolar_video():
    f = Flujo("escEncolarVideo01", "Encolar video",
              "Subworkflow. Recibe { video_id, estado_requerido } (esperando_archivo al confirmar una subida, error al reintentar), comprueba en Storage que el original exista y coincida con lo declarado, "
              "pasa el video a en_cola y le pide el trabajo al transcodificador. Devuelve { ok, estado, cuerpo } listo para responder (202 o el error). Lo usan Confirmar subida de video y Reintentar video.", "escuela")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.sql("Consultar video", """SELECT v.id, v.estado, v.tipo_contenido, v.tamano_bytes, v.ruta_base, encode(k.clave, 'hex') AS clave_hex
FROM escuela.videos_clase v JOIN escuela.claves_video k ON k.video_id = v.id WHERE v.id = $1::bigint;""", "={{ [$json.video_id] }}", 240, 0)
    f.codigo("Revisar estado", f"""const v = $input.first().json;
const requerido = $('Disparador').first().json.estado_requerido;
const EXT = {json.dumps(VIDEO_MIME)};
const error = (estado, codigo, mensaje) => [{{ json: {{ ok: false, estado, cuerpo: {{ error: {{ codigo, mensaje }} }} }} }}];
if (!v.id) return error(404, 'NO_ENCONTRADO', 'El video no existe.');
if (v.estado !== requerido) return error(409, 'ESTADO_INVALIDO', requerido === 'error' ? 'Solo se puede reintentar un video con error.' : 'Este video ya se confirmó.');
return [{{ json: {{ ok: true, video_id: Number(v.id), requerido, tipo_contenido: v.tipo_contenido, tamano_bytes: Number(v.tamano_bytes), ruta_base: v.ruta_base, ruta_original: `${{v.ruta_base}}/original.${{EXT[v.tipo_contenido]}}`, clave_hex: v.clave_hex }} }}];""", 480, 0)
    f.si("Video por encolar", "={{ $json.ok }}", 720, 0)
    f.http("Consultar archivo en Storage", "GET", f"={STORAGE}/object/info/videos/{{{{ $json.ruta_original }}}}", {}, 960, 0, servicio=True)
    f.codigo("Clasificar archivo", f"""const r = $input.first().json;
const v = $('Revisar estado').first().json;
const b = r.body || {{}};
const tamano = Number(b.size || (b.metadata || {{}}).size || 0);
const tipo = b.content_type || (b.metadata || {{}}).mimetype || '';
const error = (mensaje) => [{{ json: {{ ok: false, estado: 422, cuerpo: {{ error: {{ codigo: 'VIDEO_INVALIDO', mensaje }} }} }} }}];
if (r.statusCode !== 200) return error(v.requerido === 'error' ? 'El archivo original ya no está: sube el video otra vez.' : 'El video todavía no se subió.');
if (tamano !== v.tamano_bytes || tipo !== v.tipo_contenido) return error('El archivo subido no coincide con lo declarado.');
return [{{ json: {{ ok: true }} }}];""", 1200, 0)
    f.si("Archivo valido", "={{ $json.ok }}", 1440, 0)
    f.sql("Pasar a en cola", "UPDATE escuela.videos_clase SET estado = 'en_cola', error = NULL, actualizado_en = now() WHERE id = $1::bigint AND estado = $2::text RETURNING id;",
          "={{ [$('Revisar estado').first().json.video_id, $('Revisar estado').first().json.requerido] }}", 1680, 0)
    f.http("Pedir trabajo al transcodificador", "POST", "http://transcodificador:8090/trabajos", {}, 1920, 0, transcodificador=True, tiempo=10000,
           cuerpo="={{ JSON.stringify({ video_id: $('Revisar estado').first().json.video_id, ruta_original: $('Revisar estado').first().json.ruta_original, ruta_base: $('Revisar estado').first().json.ruta_base, clave_hex: $('Revisar estado').first().json.clave_hex }) }}")
    f.si("Trabajo aceptado", "={{ $json.statusCode === 202 }}", 2160, 0)
    f.codigo("Armar respuesta", "return [{ json: { ok: true, estado: 202, cuerpo: { estado: 'en_cola' } } }];", 2400, 0)
    f.sql("Marcar error de servicio", "UPDATE escuela.videos_clase SET estado = 'error', error = 'El servicio de video no responde. Inténtalo de nuevo.', actualizado_en = now() WHERE id = $1::bigint RETURNING id;",
          "={{ [$('Revisar estado').first().json.video_id] }}", 2400, 500)
    f.codigo("Armar error de servicio", "return [{ json: { ok: false, estado: 503, cuerpo: { error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El servicio de video no responde. Inténtalo de nuevo en unos minutos.' } } } }];", 2640, 500)
    f.nodo("Devolver error", "n8n-nodes-base.noOp", 1, {}, 960, 500)
    f.unir("Disparador", "Consultar video"); f.unir("Consultar video", "Revisar estado"); f.unir("Revisar estado", "Video por encolar")
    f.unir("Video por encolar", "Consultar archivo en Storage", 0); f.unir("Video por encolar", "Devolver error", 1)
    f.unir("Consultar archivo en Storage", "Clasificar archivo"); f.unir("Clasificar archivo", "Archivo valido")
    f.unir("Archivo valido", "Pasar a en cola", 0); f.unir("Archivo valido", "Devolver error", 1)
    f.unir("Pasar a en cola", "Pedir trabajo al transcodificador"); f.unir("Pedir trabajo al transcodificador", "Trabajo aceptado")
    f.unir("Trabajo aceptado", "Armar respuesta", 0); f.unir("Trabajo aceptado", "Marcar error de servicio", 1)
    f.unir("Marcar error de servicio", "Armar error de servicio")
    f.seccion("Entrada", "Recibe `video_id` y `estado_requerido`.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Leer el video", "Solo se encola un video que esté en el estado requerido (`esperando_archivo` o `error`); si no, `409`. Lee su clave en n8n; no sale de ahí.", NOTA_DATOS,
              ["Consultar video", "Revisar estado", "Video por encolar"], True, "Lee el video y comprueba su estado.")
    f.seccion("Comprobar en Storage", "El original debe existir y coincidir con el tipo y el tamaño declarados; si no, `422 VIDEO_INVALIDO`.", NOTA_PERMISOS,
              ["Consultar archivo en Storage", "Clasificar archivo", "Archivo valido"], True, "Comprueba el original en Storage.")
    f.seccion("Encolar el trabajo", "Pasa el video a `en_cola` y pide el trabajo al transcodificador (credencial `Secreto transcodificador`, máximo 10 s de espera).", NOTA_ENTRADA,
              ["Pasar a en cola", "Pedir trabajo al transcodificador", "Trabajo aceptado"], True, "Pasa el video a en cola y pide el trabajo.")
    f.seccion("Respuesta", "`202 { estado: 'en_cola' }`.", NOTA_RESPUESTA, ["Armar respuesta"])
    f.seccion("Servicio no disponible", "Si el transcodificador no responde (o tarda más de 10 s), el video pasa a `error` (se puede reintentar) y se devuelve `503`.", NOTA_ERROR,
              ["Marcar error de servicio", "Armar error de servicio"], True, "Marca el video en error cuando el transcodificador no responde.")
    f.seccion("Salida con error", "Un video que no está en el estado requerido o cuyo original no coincide sale tal cual.", NOTA_ERROR, ["Devolver error"])
    f.general("Encolar video", "Subworkflow compartido: **confirmar y reintentar no repiten el encolado**.\n\nEntrada: `{ video_id, estado_requerido }`. Salida: `{ ok, estado, cuerpo }` listo para el nodo *Responder* del workflow que lo llama.")
    f.guardar()


def confirmar_subida_video():
    f = Flujo("escConfirmarSubidaVideo01", "Confirmar subida de video", "POST /escuela/confirmar-subida-video. Comprueba en Storage que el video se subió y coincide con lo declarado y le pide el trabajo al transcodificador (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/confirmar-subida-video", ROLES_TEMARIO, "body", {"video_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": True, "tipo": "video", "campo": "video_id"})
    f.codigo("Preparar encolado", "return [{ json: { video_id: $input.first().json.datos.video_id, estado_requerido: 'esperando_archivo' } }];", x, 0)
    f.subflujo("Encolar video", "escEncolarVideo01", x + 240, 0)
    f.responder(x + 480, 0)
    f.unir("Acceso valido", "Preparar encolado"); f.unir("Preparar encolado", "Encolar video"); f.unir("Encolar video", "Responder")
    f.seccion("Encolar", "Subworkflow `Encolar video` con `estado_requerido: esperando_archivo`: comprueba el archivo en Storage y pide el trabajo. Responde `202`, `409`, `422` o `503`.", NOTA_DATOS,
              ["Preparar encolado", "Encolar video"], True, "Comprueba el archivo y pide el trabajo con el subworkflow compartido.")
    f.seccion("Respuesta", "Devuelve tal cual lo que responde el subworkflow, o el error de permisos o de datos.", NOTA_RESPUESTA, ["Responder"])
    f.general("Confirmar subida de video", "`POST /escuela/confirmar-subida-video` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ video_id }`. Responde `202 { estado: 'en_cola' }`. El resultado llega después, por el webhook interno *Video procesado*, y se consulta con *Estado del video*.")
    f.guardar()


def reintentar_video():
    f = Flujo("escReintentarVideo01", "Reintentar video", "POST /escuela/reintentar-video. Vuelve a encolar un video que terminó en error, si su original se conservó (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/reintentar-video", ROLES_TEMARIO, "body", {"video_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": True, "tipo": "video", "campo": "video_id"})
    f.codigo("Preparar encolado", "return [{ json: { video_id: $input.first().json.datos.video_id, estado_requerido: 'error' } }];", x, 0)
    f.subflujo("Encolar video", "escEncolarVideo01", x + 240, 0)
    f.responder(x + 480, 0)
    f.unir("Acceso valido", "Preparar encolado"); f.unir("Preparar encolado", "Encolar video"); f.unir("Encolar video", "Responder")
    f.seccion("Encolar", "Subworkflow `Encolar video` con `estado_requerido: error`. Si el original ya no está en Storage: `422 VIDEO_INVALIDO` (hay que subirlo otra vez).", NOTA_DATOS,
              ["Preparar encolado", "Encolar video"], True, "Vuelve a encolar con el subworkflow compartido.")
    f.seccion("Respuesta", "Devuelve tal cual lo que responde el subworkflow, o el error de permisos o de datos.", NOTA_RESPUESTA, ["Responder"])
    f.general("Reintentar video", "`POST /escuela/reintentar-video` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ video_id }`. Responde `202 { estado: 'en_cola' }`. Solo para un video en `error`.")
    f.guardar()


def borrar_video():
    f = Flujo("escBorrarVideo01", "Borrar video", "POST /escuela/borrar-video. Borra el video vigente de una clase y cualquiera en proceso o con error, con sus archivos de Storage (instructor dueño o su equipo; no en revisión). No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/borrar-video", ROLES_TEMARIO, "body", {"clase_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": True, "tipo": "clase", "campo": "clase_id"})
    f.sql("Borrar videos de la clase", "WITH borrados AS (DELETE FROM escuela.videos_clase WHERE clase_id = $1::bigint RETURNING ruta_base) SELECT coalesce(array_agg(ruta_base), '{}') AS rutas_base, count(*)::int AS cantidad FROM borrados;",
          "={{ [$json.datos.clase_id] }}", x, 0)
    f.codigo("Preparar rutas de videos", "const r = $input.first().json;\nreturn [{ json: { rutas_base: r.rutas_base || [] } }];", x + 240, 0)
    f.subflujo("Borrar archivos de video", "escBorrarArchivosVideo01", x + 480, 0)
    respuesta_temario(f, x + 720, "if (r.cantidad > 0) return [{ json: { estado: 204, cuerpo: null } }];", "El video", "$('Borrar videos de la clase').first().json")
    f.unir("Acceso valido", "Borrar videos de la clase"); f.unir("Borrar videos de la clase", "Preparar rutas de videos"); f.unir("Preparar rutas de videos", "Borrar archivos de video")
    f.unir("Borrar archivos de video", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 960, ["Borrar videos de la clase", "Preparar rutas de videos", "Borrar archivos de video", "Armar respuesta"], "Borrar y limpiar", "Borra de la base el video vigente y los que estén en proceso o con error (con sus claves) y luego sus archivos de Storage. Una clase sin video da `404`.")
    f.general("Borrar video", "`POST /escuela/borrar-video` · instructor dueño o equipo de apoyo.\n\nEntrada: `{ clase_id }`. Responde `204`. Si un trabajo de ese video sigue en el transcodificador, su aviso se ignora (el video ya no existe).")
    f.guardar()


def borrar_archivos_video():
    f = Flujo("escBorrarArchivosVideo01", "Borrar archivos de video",
              "Subworkflow. Recibe { rutas_base: [..] } (carpetas de videos del bucket privado videos), lista todo lo que cuelga de cada una (el original y la carpeta hls) "
              "y lo borra de Supabase Storage con la credencial de rol de servicio. Lo usan Video procesado, Borrar video y las limpiezas de clases y secciones.", "escuela")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.codigo("Preparar carpetas", "const bases = $input.first().json.rutas_base || [];\nif (bases.length === 0) return [{ json: { vacio: true } }];\nreturn bases.flatMap((b) => [{ json: { prefijo: b } }, { json: { prefijo: `${b}/hls` } }]);", 240, 0)
    f.si("Hay carpetas", "={{ !$json.vacio }}", 480, 0)
    f.http("Listar archivos", "POST", f"={STORAGE}/object/list/videos", {}, 720, 0, servicio=True, cuerpo="={{ JSON.stringify({ prefix: $json.prefijo, limit: 1000 }) }}")
    f.codigo("Juntar archivos", """const carpetas = $('Preparar carpetas').all();
const rutas = [];
$input.all().forEach((r, i) => {
  const lista = Array.isArray(r.json.body) ? r.json.body : [];
  lista.filter((e) => e.id).forEach((e) => rutas.push(`${carpetas[i].json.prefijo}/${e.name}`));
});
return [{ json: { rutas } }];""", 960, 0)
    f.si("Hay archivos", "={{ $json.rutas.length > 0 }}", 1200, 0)
    f.http("Borrar archivos en Storage", "DELETE", f"={STORAGE}/object/videos", {}, 1440, -100, servicio=True, cuerpo="={{ JSON.stringify({ prefixes: $json.rutas }) }}")
    f.unir("Disparador", "Preparar carpetas"); f.unir("Preparar carpetas", "Hay carpetas"); f.unir("Hay carpetas", "Listar archivos", 0); f.unir("Hay carpetas", "Nada que borrar", 1); f.unir("Listar archivos", "Juntar archivos")
    f.nodo("Nada que borrar", "n8n-nodes-base.noOp", 1, {}, 1440, 500)  # si no hay archivos, igual devuelve un elemento: sin él n8n corta al workflow que lo llama
    f.unir("Juntar archivos", "Hay archivos"); f.unir("Hay archivos", "Borrar archivos en Storage", 0); f.unir("Hay archivos", "Nada que borrar", 1)
    f.seccion("Entrada", "Recibe `rutas_base`: las carpetas `cursos/<c>/secciones/<s>/clases/<k>/<video>` que hay que vaciar.", NOTA_ENTRADA, ["Disparador"])
    f.seccion("Preparar", "Por cada carpeta pide el original y la subcarpeta `hls` (Storage no borra por prefijo). Sin carpetas, sale por *Nada que borrar*.", NOTA_ENTRADA, ["Preparar carpetas", "Hay carpetas"], True, "Arma la lista de carpetas a vaciar.")
    f.seccion("Listar", "Lista los archivos de cada carpeta.", NOTA_DATOS, ["Listar archivos", "Juntar archivos"], True, "Lista los archivos de cada carpeta de video.")
    f.seccion("Borrar", "Borra todos los archivos de golpe.", NOTA_ERROR, ["Hay archivos", "Borrar archivos en Storage"], True, "Borra los archivos listados de Storage.")
    f.seccion("Sin archivos", "Sin carpetas o sin archivos termina sin borrar nada pero **devuelve un elemento**: un subworkflow sin salida corta al workflow que lo llamó y nunca llega a su `Responder`.", NOTA_RESPUESTA, ["Nada que borrar"])
    f.general("Borrar archivos de video", "Subworkflow compartido: **nadie repite la limpieza de Storage**.\n\nEntrada: `{ rutas_base: [...] }`. Con la credencial **Supabase rol de servicio**. El borrado es de mejor esfuerzo: la fila de la base ya no existe cuando se llama.")
    f.guardar()


def video_procesado():
    f = Flujo("escVideoProcesado01", "Video procesado", "POST /webhook/escuela/interno/video-procesado. Webhook interno: el transcodificador avisa del resultado de un video. Si quedó listo, lo hace el vigente de su clase y borra el anterior con sus archivos; si falló, lo deja en error con el mensaje. No está en Caddy. No guarda ejecuciones.", "escuela")
    x = protegido(f, "POST", "escuela/interno/video-procesado", None, "body", {
        "video_id": TEXTO_ID, "resultado": {"tipo": "opcion", "valores": ["listo", "error"]},
        "duracion_segundos": {"tipo": "entero", "opcional": True, "minimo": 1, "maximo": 86400}, "mensaje": {"tipo": "texto", "opcional": True, "maximo": 500, "multilinea": True}},
        None, CRED_TRANSCODIFICADOR)
    f.sql("Registrar resultado", """UPDATE escuela.videos_clase SET
  estado = CASE WHEN $2::text = 'listo' THEN 'listo' ELSE 'error' END,
  duracion_segundos = CASE WHEN $2::text = 'listo' THEN $3::int END,
  listo_en = CASE WHEN $2::text = 'listo' THEN now() END,
  error = CASE WHEN $2::text = 'listo' THEN NULL ELSE coalesce($4::text, 'El video no se pudo procesar.') END,
  actualizado_en = now()
WHERE id = $1::bigint AND estado IN ('en_cola', 'procesando') RETURNING id, clase_id;""",
          "={{ [$json.datos.video_id, $json.datos.resultado, $json.datos.duracion_segundos, $json.datos.mensaje] }}", x, 0)
    f.codigo("Clasificar resultado", """const r = $input.first().json;
const d = $('Entrada valida').first().json.datos;
return [{ json: { aplicado: !!r.id, listo: !!r.id && d.resultado === 'listo', video_id: d.video_id, clase_id: r.clase_id ? Number(r.clase_id) : null } }];""", x + 240, 0)
    f.si("Es video listo", "={{ $json.listo }}", x + 480, 0)
    f.sql("Retirar anterior", "DELETE FROM escuela.videos_clase WHERE clase_id = $1::bigint AND vigente AND id <> $2::bigint RETURNING ruta_base;",
          "={{ [$json.clase_id, $json.video_id] }}", x + 720, -100)
    f.sql("Hacer vigente", "UPDATE escuela.videos_clase SET vigente = true WHERE id = $1::bigint RETURNING id;",
          "={{ [$('Clasificar resultado').first().json.video_id] }}", x + 960, -100)
    f.codigo("Preparar rutas anteriores", "return [{ json: { rutas_base: $('Retirar anterior').all().map((i) => i.json.ruta_base).filter(Boolean) } }];", x + 1200, -100)
    f.subflujo("Borrar archivos de video", "escBorrarArchivosVideo01", x + 1440, -100)
    f.codigo("Armar respuesta", "return [{ json: { estado: 200, cuerpo: { aplicado: $('Clasificar resultado').first().json.aplicado } } }];", x + 1680, 0)
    f.unir("Entrada valida", "Registrar resultado"); f.unir("Registrar resultado", "Clasificar resultado"); f.unir("Clasificar resultado", "Es video listo")
    f.unir("Es video listo", "Retirar anterior", 0); f.unir("Es video listo", "Armar respuesta", 1)
    f.unir("Retirar anterior", "Hacer vigente"); f.unir("Hacer vigente", "Preparar rutas anteriores"); f.unir("Preparar rutas anteriores", "Borrar archivos de video")
    f.unir("Borrar archivos de video", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    f.seccion("Anotar el resultado", "Solo cambia un video que sigue `en_cola` o `procesando`: un aviso repetido o de un video ya borrado se ignora (`aplicado: false`). `listo` guarda la duración; `error` guarda el mensaje y conserva el original.", NOTA_DATOS,
              ["Registrar resultado", "Clasificar resultado", "Es video listo"], True, "Anota listo o error en el video.")
    f.seccion("Reemplazar el anterior", "El video nuevo pasa a ser el único vigente de su clase: se borra la fila del anterior, se marca vigente el nuevo y después se borran del bucket los archivos del anterior (subworkflow compartido).", NOTA_PERMISOS,
              ["Retirar anterior", "Hacer vigente", "Preparar rutas anteriores", "Borrar archivos de video"], True, "Pone el video nuevo como vigente y borra el anterior.")
    f.responder(x + 1920, 0)
    f.seccion("Respuesta", "`200 { aplicado }` para el transcodificador.", NOTA_RESPUESTA, ["Armar respuesta", "Responder"])
    f.general("Video procesado", "`POST /webhook/escuela/interno/video-procesado` · **interno**: solo el transcodificador, con la credencial *Secreto transcodificador*. No está en Caddy.\n\nEntrada: `{ video_id, resultado: 'listo' | 'error', duracion_segundos?, mensaje? }`.")
    f.guardar()


def estado_video():
    f = Flujo("escEstadoVideo01", "Estado del video", "GET /escuela/estado-video?clase_id=. Devuelve el video vigente de una clase y, si lo hay, el que se está subiendo, procesando o terminó en error (instructor dueño o su equipo). Un video en cola o procesando sin cambios en 45 minutos pasa a error. No guarda ejecuciones.", "escuela")
    x = protegido(f, "GET", "escuela/estado-video", ROLES_TEMARIO, "query", {"clase_id": TEXTO_ID},
                  {"modo": "dueno_o_equipo", "editable": False, "tipo": "clase", "campo": "clase_id"})
    f.sql("Cerrar vencidos", "UPDATE escuela.videos_clase SET estado = 'error', error = 'El procesamiento tardó demasiado.', actualizado_en = now() WHERE clase_id = $1::bigint AND estado IN ('en_cola', 'procesando') AND actualizado_en < now() - interval '45 minutes' RETURNING id;",
          "={{ [$json.datos.clase_id] }}", x, 0)
    f.sql("Consultar estado", """SELECT
  (SELECT json_build_object('id', v.id, 'estado', v.estado, 'duracion_segundos', v.duracion_segundos, 'listo_en', v.listo_en)
   FROM escuela.videos_clase v WHERE v.clase_id = $1::bigint AND v.vigente) AS vigente,
  (SELECT json_build_object('id', v.id, 'estado', v.estado, 'error', v.error)
   FROM escuela.videos_clase v WHERE v.clase_id = $1::bigint AND NOT v.vigente ORDER BY v.id DESC LIMIT 1) AS nuevo;""",
          "={{ [$('Entrada valida').first().json.datos.clase_id] }}", x + 240, 0)
    f.codigo("Armar respuesta", "const r = $input.first().json;\nreturn [{ json: { estado: 200, cuerpo: { vigente: r.vigente, nuevo: r.nuevo } } }];", x + 480, 0)
    f.unir("Acceso valido", "Cerrar vencidos"); f.unir("Cerrar vencidos", "Consultar estado"); f.unir("Consultar estado", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 720, ["Cerrar vencidos", "Consultar estado", "Armar respuesta"], "Consultar el estado", "Primero cierra como `error` los videos en cola o procesando con más de 45 minutos sin cambios (\"El procesamiento tardó demasiado.\") y luego lee el vigente y el último no vigente de la clase.")
    f.general("Estado del video", "`GET /escuela/estado-video?clase_id=` · instructor dueño o equipo de apoyo.\n\nResponde `{ vigente, nuevo }`: `vigente` es el video que se sirve; `nuevo`, el que se está subiendo o procesando (o falló, con su `error`). El front lo consulta cada 3 s mientras hay uno en cola.")
    f.guardar()


if __name__ == "__main__":
    validar_sesion_y_roles()
    mis_roles()
    exigir_rol()
    buscar_cuenta()
    validar_campos()
    categorias()
    guardar_categoria()
    borrar_categoria()
    buscar_usuario()
    asignar_rol()
    validar_acceso()
    mis_cursos()
    curso_edicion()
    crear_curso()
    editar_curso()
    guardar_seccion()
    borrar_seccion()
    guardar_clase()
    borrar_clase()
    mover()
    enviar_revision()
    cursos_en_revision()
    resolver_revision()
    retirar_curso()
    url_subida_portada()
    confirmar_portada()
    cursos_catalogo()
    curso_publico()
    invitar_equipo()
    mi_equipo()
    cancelar_invitacion()
    quitar_miembro()
    mis_invitaciones()
    responder_invitacion()
    solicitar_subida_video()
    encolar_video()
    confirmar_subida_video()
    reintentar_video()
    borrar_video()
    borrar_archivos_video()
    video_procesado()
    estado_video()
