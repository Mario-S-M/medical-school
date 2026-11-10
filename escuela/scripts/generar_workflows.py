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

    def http(self, nombre, metodo, url, cabeceras, x, y, servicio=False, formato="json"):
        p = {"method": metodo, "url": url, "options": {"response": {"response": {"fullResponse": True, "neverError": True, "responseFormat": formato}}},
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
              "Subworkflow. Recibe la solicitud del webhook más rol_requerido (un rol o una lista: basta con uno), valida la sesión con Validar sesion y roles y comprueba que el usuario lo tenga. "
              "Devuelve el mismo item con { ok, usuario, roles, equipos } o { ok: false, estado: 401 o 403, cuerpo }.", "usuarios")
    f.nodo("Disparador", "n8n-nodes-base.executeWorkflowTrigger", 1.1, {"inputSource": "passthrough"}, 0, 0)
    f.subflujo("Validar sesion y roles", "escValidar01", 240, 0)
    f.si("Sesion valida", "={{ $json.ok }}", 480, 0)
    f.codigo("Comprobar rol", f"""const contexto = $input.first().json;
const original = $('Disparador').first().json;
if (![].concat(original.rol_requerido).some((r) => contexto.roles.includes(r))) {{
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


def protegido(f, metodo, ruta, rol, origen, reglas, acceso=None):
    """Entrada común de un endpoint: webhook, permiso por rol (si rol) y validación de campos (si reglas).
    Los errores de los dos pasos van directo a "Responder". Devuelve la columna libre siguiente."""
    f.webhook(metodo, ruta, 0, 0)
    anterior, x = "Recibir solicitud", 240
    f.seccion("Entrada", "Webhook protegido por el secreto del proxy (Caddy es la única entrada).", NOTA_ENTRADA, ["Recibir solicitud"])
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
    f.subflujo("Validar campos", "escValidarCampos01", x, 0)
    f.si("Entrada valida", "={{ $json.ok }}", x + 240, 0)
    f.unir(anterior, "Validar campos"); f.unir("Validar campos", "Entrada valida"); f.unir("Entrada valida", "Responder", 1)
    f.seccion("Validar entrada", "Subworkflow `Validar campos`: tipos, largos y campos extra. Si falla, `422 VALIDACION_FALLIDA` con la lista de reglas.", NOTA_ENTRADA,
              ["Validar campos", "Entrada valida"], True, "Valida y normaliza los campos con el subworkflow compartido.")
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


def validar_acceso():
    f = Flujo("escValidarAcceso01", "Validar acceso a curso",
              "Subworkflow. Recibe el item con usuario, datos y acceso { modo: dueno | dueno_o_equipo, editable, tipo: curso | seccion | clase | dato, campo }, "
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
    f.seccion("Comprobar acceso", "Resuelve el curso (directo, o a partir de una sección o una clase), lo consulta y decide: `404` si no existe, `403` si no es del usuario ni de su equipo, `409` si está en revisión y se va a editar.", NOTA_PERMISOS,
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
             'duracion_estimada_minutos', k.duracion_estimada_minutos, 'es_muestra', k.es_muestra, 'posicion', k.posicion) ORDER BY k.posicion)
      FROM escuela.clases k WHERE k.seccion_id = s.id), '[]'::json)) ORDER BY s.posicion)
    FROM escuela.secciones s WHERE s.curso_id = c.id), '[]'::json)) AS curso
FROM escuela.cursos c WHERE c.id = $1::bigint;""", "={{ [$json.curso.id] }}", x, 0)
    f.codigo("Armar respuesta", "const dueno = $('Acceso valido').first().json.es_dueno;\nreturn [{ json: { estado: 200, cuerpo: { ...$input.first().json.curso, es_dueno: dueno } } }];", x + 240, 0)
    f.unir("Acceso valido", "Consultar curso completo"); f.unir("Consultar curso completo", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Consultar curso completo", "Armar respuesta"], "Leer el curso", "Devuelve el curso con sus secciones y clases en orden, y `es_dueno` para que el editor sepa si puede cambiar los datos del curso.")
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


def respuesta_temario(f, x, ok_js, titulo_nota):
    """Nodo "Armar respuesta" común de los endpoints del temario: 404 si el SQL no encontró nada."""
    f.codigo("Armar respuesta", f"""const r = $input.first().json;
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
    f.sql("Borrar y renumerar", """WITH borrada AS (
  DELETE FROM escuela.secciones WHERE id = $1::bigint RETURNING curso_id
), renumeradas AS (
  UPDATE escuela.secciones s SET posicion = n.nueva
  FROM (SELECT id, row_number() OVER (ORDER BY posicion) AS nueva FROM escuela.secciones
        WHERE curso_id = (SELECT curso_id FROM borrada) AND id <> $1::bigint) n
  WHERE s.id = n.id RETURNING s.id
)
SELECT EXISTS (SELECT 1 FROM borrada) AS borrada;""", "={{ [$json.datos.seccion_id] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.borrada) return [{ json: { estado: 204, cuerpo: null } }];", "La sección")
    f.unir("Acceso valido", "Borrar y renumerar"); f.unir("Borrar y renumerar", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Borrar y renumerar", "Armar respuesta"], "Borrar la seccion", "Borra la sección (sus clases se van con ella) y deja las demás numeradas `1..n` sin huecos, todo en una sola consulta.")
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
    f.sql("Borrar y renumerar", """WITH borrada AS (
  DELETE FROM escuela.clases WHERE id = $1::bigint RETURNING seccion_id
), renumeradas AS (
  UPDATE escuela.clases k SET posicion = n.nueva
  FROM (SELECT id, row_number() OVER (ORDER BY posicion) AS nueva FROM escuela.clases
        WHERE seccion_id = (SELECT seccion_id FROM borrada) AND id <> $1::bigint) n
  WHERE k.id = n.id RETURNING k.id
)
SELECT EXISTS (SELECT 1 FROM borrada) AS borrada;""", "={{ [$json.datos.clase_id] }}", x, 0)
    respuesta_temario(f, x + 240, "if (r.borrada) return [{ json: { estado: 204, cuerpo: null } }];", "La clase")
    f.unir("Acceso valido", "Borrar y renumerar"); f.unir("Borrar y renumerar", "Armar respuesta"); f.unir("Armar respuesta", "Responder")
    cierre(f, x + 480, ["Borrar y renumerar", "Armar respuesta"], "Borrar la clase", "Borra la clase y deja las demás de su sección numeradas `1..n` sin huecos.")
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
  seccion_vacia: 'Hay secciones sin ninguna clase.' };"""
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
                      AND NOT EXISTS (SELECT 1 FROM escuela.clases k WHERE k.seccion_id = s.id)) THEN 'seccion_vacia' END
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
    f.general("Enviar a revision", "`POST /escuela/enviar-revision` · solo el `instructor` dueño.\n\nEntrada: `{ curso_id }`. Exige título, subtítulo, descripción, nivel, categoría, portada, al menos una sección y ninguna sección vacía. Responde `200 { estado: 'en_revision' }`; un curso que no está en borrador da `409`.")
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
