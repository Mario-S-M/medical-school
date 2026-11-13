# SPEC 12 — Reproducción protegida de los videos de clase, con clave por sesión, URL firmadas y marca de agua

**Estado:** Implementado
**Depende de:** SPEC 11 (y, a través de ella, SPEC 10, 09, 08, 07, 06, 05, 04, 03, 02 y 01)
**Fecha:** 2026-11-13
**Objetivo:** Permitir que una cuenta autorizada vea el video de una clase en el navegador, con un reproductor de `hls.js` que recibe la clave de cifrado y las URL de los segmentos solo mediante una autorización de 10 minutos renovable, y con el correo de quien mira flotando sobre el video como marca de agua.

## Por qué existe esta spec

La SPEC 08 dejó los videos procesados y cifrados con AES-128 en un bucket privado, pero **nadie puede verlos**: la lista `.m3u8` guarda un marcador (`URI="clave"`) en lugar de una clave entregable y los segmentos solo se alcanzan con la clave de servicio. Esta spec abre ese acceso con reglas, y es la que cumple la petición original de "que los videos no se puedan descargar" hasta donde lo permite la web sin DRM comercial.

**Límite que hay que decir claramente:** un navegador que reproduce un video tiene que recibir la clave y los segmentos. Quien tenga permiso y sepa usar las herramientas del navegador puede guardarlos durante la vida de la autorización. Lo que esta spec consigue es: que el video **no se pueda descargar con un clic ni con un enlace copiado**, que las URL y la clave **mueran a los 10 minutos**, que **solo las cuentas autorizadas** las obtengan, y que cualquier copia por grabación de pantalla o captura **lleve el correo de quien la hizo**. Impedir la copia de forma absoluta exige DRM comercial (Widevine, FairPlay), que queda fuera.

**Hoja de ruta:** la inscripción gratuita y el avance son la SPEC 13; a partir de ahí quién ve las clases que no son muestra pasa a depender de la inscripción. Hoy, sin inscripción, el acceso lo deciden las reglas de la sección "Alcance".

## Alcance

**Entra:**

- **Reglas de acceso** (las decide la API, nunca el front). Una cuenta con sesión puede reproducir una clase si:
  - la clase es **muestra** y su curso está **publicado** (cualquier cuenta con sesión), o
  - es el **instructor dueño del curso**, su **equipo de apoyo** o un **administrador**, en cualquier estado del curso y para cualquier clase.
  Sin sesión no se reproduce nada. La clase debe tener un video **vigente y `listo`**.
- **Autorización de reproducción** en GraphQL: la mutación `autorizar_reproduccion(clase_id)` comprueba las reglas y devuelve un **token de reproducción** de **10 minutos** (`SEGUNDOS_AUTORIZACION_REPRODUCCION`, por defecto 600), el nombre de la lista, la duración y el correo de quien mira para la marca de agua. No guarda nada en la base.
- **Token de reproducción:** JWT HS256 firmado con el mismo `JWT_SECRET` pero con **audiencia propia** (`reproduccion`) y atado a un `video_id` y a una cuenta. El token de acceso normal no sirve para la lista ni para la clave, ni el de reproducción sirve para GraphQL.
- **Dos rutas REST de borde** bajo `/api/v1/reproducciones/{video_id}/`, ambas con `Authorization: Bearer <token de reproducción>` y `Cache-Control: no-store`:
  - `GET lista.m3u8`: lee `<ruta_base>/hls/lista.m3u8` del bucket privado `videos`, deja el `#EXT-X-KEY` tal cual (su `URI="clave"` resuelve, relativo a esta ruta, a `/api/v1/reproducciones/{video_id}/clave`) y **sustituye cada `segmento_NNNNN.ts` por una URL firmada de Storage** con la misma vida que la autorización, firmadas todas en una sola llamada por lotes.
  - `GET clave`: devuelve los **16 bytes** de la clave AES-128 (`application/octet-stream`), leídos de `claves_video`. Es la **única** ruta que entrega la clave.
- **Reproductor en el front:** página `/clase?id=<clase_id>` con `hls.js` (última versión), que:
  - pide la autorización y manda el token solo a `/api/v1/reproducciones/*` (no a Storage);
  - **renueva** la autorización al 80 % de su vida (a los 8 minutos), vuelve a pedir la lista y sigue en el mismo segundo, sin que se note, mientras el video se esté reproduciendo;
  - muestra mensajes en español si la cuenta no tiene permiso, si el video aún no está listo o si el navegador no soporta la reproducción.
- **Marca de agua** (superposición flotante con el correo de la cuenta): cambia de posición cada pocos segundos, no recibe clics y vive dentro del mismo contenedor que el video. Si se borra, se oculta, se vuelve transparente o se reduce a nada, el video **se pausa** y se pide recargar. Pantalla completa solo del contenedor (la nativa del `<video>` se desactiva) para que la marca no se pierda.
- **Protecciones del elemento de video:** sin botón de descarga, sin menú contextual, sin imagen en imagen ni envío a otros dispositivos.
- **Enlaces para llegar a la clase:** "Ver clase" en las clases muestra de la ficha pública (lleva a iniciar sesión si no hay sesión), en cada clase con video listo del editor del instructor y en las clases de la tarjeta de revisión del administrador.
- **Error nuevo:** `VIDEO_NO_DISPONIBLE` (409) cuando la clase no tiene un video vigente y `listo`.
- **Pruebas:** e2e de Jest (autorización, tokens, lista, clave, URL firmadas con vida corta y un video real descifrado con la clave que entrega la API) y Playwright (ver una muestra reproduciéndose con su marca de agua, acceso denegado a quien no corresponde, renovación y protección de la marca).
- **Documentación:** `api/README.md`, `frontend/README.md` y la colección de Postman de la escuela con la mutación y las dos rutas.

**No entra:**

- Inscripción gratuita, quién ve cada clase según su inscripción y el porcentaje de avance (SPEC 13).
- **DRM comercial** (Widevine, FairPlay) y cualquier garantía de que el video no se pueda copiar. Ver "Riesgos".
- Marca de agua **quemada en el video** (se descartó) y regeneración de videos por sesión.
- Auditoría de quién vio qué (tabla de reproducciones) y analítica de visualización.
- Rotación o cambio de claves de los videos ya procesados.
- Varias calidades, subtítulos y capítulos.
- Descargas sin conexión y reproducción en navegadores sin soporte de MSE (iPhone con iOS anterior a 17.1): se muestra un mensaje.
- TLS, HSTS y el proxy `/almacen` de producción (hoy solo existe el del servidor de desarrollo de Astro, como en las portadas).

## Modelo de datos

Esta spec **no crea tablas ni cambia las existentes**: usa `escuela.videos_clase`, `escuela.claves_video`, `escuela.clases`, `escuela.cursos` y `escuela.equipos_apoyo` tal como están.

**Token de reproducción** (JWT HS256, firmado con `JWT_SECRET`):

```json
{ "iss": "<API_EXTERNAL_URL>", "aud": "reproduccion", "sub": "<uuid de la cuenta>",
  "vid": 31, "cid": 7, "iat": 1763040000, "exp": 1763040600 }
```

Se verifica con la misma utilidad de JWT de la API pasando `audience: 'reproduccion'`. Un token con otra audiencia, caducado, de otra cuenta o de otro `video_id` se rechaza.

**GraphQL** (campos en español y `snake_case`, igual que el resto; la operación entra al manifiesto de consultas persistidas):

```graphql
type AutorizacionReproduccion {
  video_id: EnteroGrande!
  token: String!
  expira_en: Int!            # segundos de vida que le quedan
  lista_url: String!         # /api/v1/reproducciones/<video_id>/lista.m3u8
  duracion_segundos: Int
  marca_agua: String!        # correo de la cuenta que mira
}
type Mutation { autorizar_reproduccion(clase_id: EnteroGrande!): AutorizacionReproduccion! }
```

**REST** (mismo formato de error que el resto de la API):

| Método y ruta | Quién | Salida |
|---|---|---|
| `GET /api/v1/reproducciones/{video_id}/lista.m3u8` | token de reproducción de ese video | `200 application/vnd.apple.mpegurl` con el `#EXT-X-KEY` y los segmentos como URL firmadas |
| `GET /api/v1/reproducciones/{video_id}/clave` | token de reproducción de ese video | `200 application/octet-stream`, 16 bytes |

Sin token, caducado o con otra audiencia: `401 TOKEN_INVALIDO`. Token de otro video: `403 SIN_PERMISO`. Video ya no vigente o no `listo`: `404 NO_ENCONTRADO`. Ambas rutas cuentan para el límite de 120 peticiones por minuto por IP (el contador es por ruta, como en el resto de las rutas REST).

**Errores:**

| Código | HTTP lógico | Cuándo |
|---|---|---|
| `VIDEO_NO_DISPONIBLE` | 409 | la clase no tiene un video vigente y `listo` |

`TOKEN_INVALIDO` (sin sesión), `SIN_PERMISO` (la cuenta no puede ver esa clase) y `NO_ENCONTRADO` (clase inexistente) se reutilizan.

**Variables:** `SEGUNDOS_AUTORIZACION_REPRODUCCION` (opcional, entero de 60 a 3600, por defecto 600), con valor por defecto en la configuración de la API y sin necesidad de ponerla en el `.env`.

**Estructura nueva:**

```text
api/src/modules/playback/
  playback.module.ts
  controllers/playback.controller.ts       (lista y clave, REST)
  resolvers/playback.resolver.ts           (autorizar_reproduccion)
  services/playback-access.service.ts      (reglas de acceso)
  services/playback-token.service.ts       (emitir y verificar el token)
  services/playlist.service.ts             (leer la lista y firmar los segmentos)
  guards/playback-token.guard.ts
  models/playback.models.ts
frontend/src/pages/clase.astro
frontend/src/features/player/{api,components,hooks,lib,schemas}/
```

Y un método nuevo `signDownloads` en `StorageService` para firmar las descargas por lotes. Los nombres siguen la regla de `CLAUDE.md` (código en inglés; contrato y URL de página en español).

## Plan de implementación

1. **Reglas de acceso y token.** Módulo `playback`: `PlaybackAccessService` (muestra de curso publicado para cualquier cuenta; dueño, equipo y administrador para todo), `PlaybackTokenService` y la mutación `autorizar_reproduccion`, con `VIDEO_NO_DISPONIBLE`. Comprobar: la matriz de permisos (sin sesión, estudiante con muestra y con clase normal, dueño, equipo, administrador, curso en borrador), token con audiencia propia y vida de `SEGUNDOS_AUTORIZACION_REPRODUCCION`, y que el token de acceso normal no se acepta donde se pide el de reproducción.
2. **Lista y clave.** `GET lista.m3u8` y `GET clave` con su guardia. Primero se confirma con la documentación de Storage (y con una prueba real) el endpoint por lotes para firmar descargas; si no existe tal cual, se ajusta la spec antes de seguir. Comprobar: la lista conserva `METHOD=AES-128` y el `IV`, cada segmento es una URL firmada, la clave devuelta es de 16 bytes y coincide con `claves_video`, token ajeno o caducado se rechaza, y las dos respuestas son `no-store`.
3. **Punta a punta con un video real.** Con el transcodificador real: subir un MP4 de unos segundos, autorizar, pedir lista y clave, bajar los segmentos por sus URL firmadas, descifrarlos con la clave de la API (no la de la base) y comprobar con `ffprobe` que son un TS válido. Probar que una URL firmada deja de servir tras su vida (con `SEGUNDOS_AUTORIZACION_REPRODUCCION` bajo en una app en proceso).
4. **Reproductor.** Página `/clase`, `hls.js`, autorización, token solo hacia `/api/v1/reproducciones/*`, renovación al 80 %, mensajes de error en español y pantalla completa del contenedor. Comprobar a mano con una muestra: el video se reproduce, avanza el tiempo y a los 8 minutos (o con el reloj adelantado) se renueva sin cortarse.
5. **Marca de agua y protecciones.** Superposición móvil con el correo, vigilancia que pausa el video si la marca desaparece, y atributos del `<video>`. Comprobar: se ve el correo, cambia de lugar, y borrarla o ocultarla desde las herramientas del navegador pausa el video.
6. **Enlaces, manifiesto y pruebas.** "Ver clase" en la ficha, el editor y la revisión; `npm run codegen` para el manifiesto de consultas persistidas y reconstruir `api`; Playwright de punta a punta. Comprobar: las suites completas de la API y del front siguen en verde.
7. **Documentación y repaso.** README de la API y del front, Postman, y repaso de los criterios.

## Criterios de aceptación

- [x] `npm run build`, `npm run lint`, `npm test` (256 pruebas) y `npm run test:e2e` (20 suites, 385 pruebas) en `api/` terminan con código 0; `npm run build`, `npx astro check` (0 errores) y `npx playwright test` del front (68 pruebas: 35 en el proyecto `principal` y 33 en el proyecto `video`, con Google Chrome) pasan; `frontend/scripts/verificar_tamano.sh` y `bash scripts/check-names.sh todo` terminan con código 0.
- [x] `autorizar_reproduccion` sin sesión da `TOKEN_INVALIDO`; con la clase de un curso publicado marcada como muestra, cualquier cuenta con sesión recibe un token; con una clase que no es muestra, una cuenta que no es dueño, equipo ni administrador recibe `SIN_PERMISO`.
- [x] El dueño, un miembro de su equipo y un administrador reciben token para cualquier clase con video listo, incluso si el curso está en borrador; una clase inexistente da `NO_ENCONTRADO` y una clase sin video vigente y `listo` da `VIDEO_NO_DISPONIBLE`.
- [x] La respuesta incluye `lista_url`, `video_id`, `duracion_segundos`, `expira_en` igual a `SEGUNDOS_AUTORIZACION_REPRODUCCION` (±2 s) y `marca_agua` con el correo de la cuenta que pidió la autorización.
- [x] El token tiene audiencia `reproduccion`: el token de acceso normal en `lista.m3u8` o `clave` da `401 TOKEN_INVALIDO`, y el de reproducción en `/api/graphql` también. Un token caducado da `401`, y el de otro video da `403 SIN_PERMISO`.
- [x] `GET .../lista.m3u8` con un token válido responde `200` con `Content-Type: application/vnd.apple.mpegurl` y `Cache-Control: no-store`; contiene `#EXT-X-KEY:METHOD=AES-128` con su `IV`, ningún `segmento_NNNNN.ts` sin firmar y una URL firmada por segmento.
- [x] `GET .../clave` con un token válido responde `200 application/octet-stream` de exactamente 16 bytes, `Cache-Control: no-store`, y esos bytes coinciden con `escuela.claves_video` del video. Sin token o con uno inválido no devuelve ningún byte de la clave.
- [x] La clave de cifrado **solo** sale por `GET .../clave`: ninguna respuesta de GraphQL, de los demás endpoints REST ni de errores contiene `clave` ni `clave_hex`, y la introspección no tiene ningún campo de clave.
- [x] Con un video real procesado por el transcodificador, descargar los segmentos por las URL firmadas y descifrarlos con la clave que entrega la API da archivos TS válidos (`ffprobe`), y un segmento sin descifrar no lo es.
- [x] Una URL firmada de segmento deja de servir pasada su vida (`SEGUNDOS_AUTORIZACION_REPRODUCCION`), y una URL firmada de otro video no sirve para éste.
- [x] Las rutas de reproducción cuentan para el límite de peticiones, **por ruta y por IP** (cada ruta lleva su contador, como el resto de las rutas REST): la 121 de una misma IP en un minuto a la misma ruta (`clave` o `lista.m3u8`) da `429` con `Retry-After`.
- [x] En el navegador, una cuenta con sesión abre `/clase?id=<muestra>` y el video se reproduce: `currentTime` avanza y no hay errores de `hls.js` en consola. Sin sesión, `/clase` lleva a iniciar sesión.
- [x] El token de reproducción solo se envía a `/api/v1/reproducciones/*`, y la cabecera `Authorization` solo va hacia la API (`/api/…`: el token de acceso a `/api/graphql`, el de reproducción a `/api/v1/reproducciones/*`): ninguna petición a Storage (`/almacen/…`) la lleva, y el token no aparece en ninguna URL, almacenamiento ni cookie.
- [x] La autorización se renueva sola al 80 % de su vida mientras se reproduce: con el reloj del navegador adelantado se observa una segunda llamada a `autorizar_reproduccion` y el video sigue sin detenerse.
- [x] La marca de agua muestra el correo de la cuenta encima del video, cambia de posición al menos cada 10 segundos y no recibe clics. Quitarla del DOM, ponerla con `display: none`, `visibility: hidden`, opacidad 0 (propia o por el producto de las opacidades de sus ancestros), `color` o `-webkit-text-fill-color` transparentes, `filter`, `clip-path` o `mix-blend-mode` que la oculten, letra mínima, recortarla, sacar el texto de su caja o taparla con otro elemento **pausa el video** en menos de 3 segundos y muestra un aviso en español.
- [x] El `<video>` no ofrece descarga, menú contextual, imagen en imagen ni transmisión a otros dispositivos, y la pantalla completa es la del contenedor (la marca de agua sigue visible).
- [x] Una cuenta sin permiso que abre `/clase?id=<clase que no es muestra>` ve "Esta clase no está disponible para tu cuenta." y no se hace ninguna petición a la lista ni a la clave; una clase sin video listo muestra "El video de esta clase todavía no está listo.".
- [x] La ficha pública muestra "Ver clase" solo en las clases muestra; el editor del instructor lo muestra en las clases con video listo, y la tarjeta de revisión lo muestra al administrador en las clases con video listo (para ello `curso` y `cursos_en_revision` devuelven un booleano `tiene_video` por clase). Un visitante sin sesión que lo pulsa llega a `/iniciar-sesion`.
- [x] La operación `autorizar_reproduccion` está en el manifiesto de consultas persistidas, el contenedor `api` en producción la acepta por hash y rechaza su texto completo con `CONSULTA_NO_PERMITIDA` (comprobado contra el contenedor reconstruido).
- [x] Ningún archivo de `api/` ni de `frontend/` contiene el valor de `JWT_SECRET`, `SERVICE_ROLE_KEY` ni `SECRETO_TRANSCODIFICADOR`, y la colección de Postman nueva es JSON válido sin secretos.
- [x] `api/README.md` documenta la mutación, las dos rutas, las reglas de acceso, la vida de la autorización y los límites; el README del front documenta la página `/clase`, la renovación y la marca de agua.

## Decisiones tomadas y descartadas

**Acceso:**

- **Tomada: las clases muestra las ve cualquier cuenta con sesión; el resto, solo el dueño, su equipo y los administradores, hasta que llegue la inscripción (SPEC 13).** Es lo que decidió la SPEC 08. **Descartados:** todo para cualquier cuenta (acceso gratis a todo, que habría que cerrar después) y solo editores y administradores (impide que un visitante pruebe una muestra).
- **Tomada: dueño, equipo y administrador ven cualquier clase en cualquier estado del curso.** Necesitan revisar lo que suben y aprueban. **Descartado:** limitarlo a cursos publicados.

**Entrega:**

- **Tomada: lista reescrita con URL firmadas de Storage; el video baja directo de Storage y la API solo entrega lista y clave.** Es rápido y no carga la API con el video. **Descartado:** que NestJS haga de proxy de todos los segmentos (más control por segmento, pero lento y pesado).
- **Tomada: la clave solo sale por `GET .../clave`, con token de reproducción y `no-store`.** **Descartados:** meter la clave en la lista y entregarla por GraphQL.
- **Tomada: el `URI="clave"` guardado por la SPEC 08 se deja tal cual.** Relativo a `/api/v1/reproducciones/{id}/lista.m3u8` ya resuelve a la ruta de la clave, así que no hay que reescribirlo ni reprocesar videos.
- **Tomada: token de reproducción propio (audiencia `reproduccion`, atado a un video y una cuenta) y firmado con el mismo `JWT_SECRET`.** Así el token de acceso de 15 minutos no abre la clave y uno filtrado de reproducción no abre nada más. **Descartado:** reutilizar el token de acceso, y una tabla de autorizaciones (no hace falta guardar nada).
- **Tomada: 10 minutos renovables, con la renovación al 80 %.** Una clase recomendada (2 a 9 minutos) cabe en una autorización, y un enlace copiado muere pronto. **Descartados:** 2 minutos (más renovaciones) y 1 hora (un enlace filtrado serviría demasiado).
- **Tomada: el token viaja en la cabecera `Authorization` solo hacia `/api/v1/reproducciones/*`.** No va en URL ni hacia Storage, para que no quede en registros ni en el historial. **Descartado:** el token en la URL de la clave.

**Marca de agua y reproductor:**

- **Tomada: marca de agua flotante en el reproductor, con vigilancia que pausa el video si desaparece.** Identifica a quien graba o captura la pantalla, sin costo de procesamiento. **Descartada:** quemarla en el video por sesión, que no se puede quitar pero exige regenerar el video con `ffmpeg` en cada reproducción y una cola de trabajos.
- **Tomada: la pantalla completa es la del contenedor (video y marca juntos) y se desactiva la nativa del `<video>`.** Si no, la marca desaparecería en pantalla completa.
- **Tomada: `hls.js` y página propia `/clase?id=`.** Funciona en los navegadores con MSE, y la clase tiene su propia URL para enlazarla. **Descartado:** un reproductor en ventana modal dentro de la ficha.

### Notas de implementación

- **Criterios ajustados (texto):** el límite de 120 peticiones es **por ruta y por IP** (la 121.ª a `clave` o a `lista.m3u8`), no un único contador para las dos; `Authorization` va hacia la API (`/api/…`) y nunca hacia `/almacen`, y el token de reproducción solo hacia `/api/v1/reproducciones/*`; la pausa de la marca de agua cubre ahora más manipulaciones (ver abajo); los conteos reales son 256 pruebas unitarias, 385 e2e en 20 suites y 68 de Playwright.
- **Proyecto de Playwright `video`:** el Chromium de Playwright no trae H.264/AAC, así que `tests/player.spec.ts` corre con Google Chrome (`channel: 'chrome'`) y el proyecto `principal` lo ignora. En Chrome el clic de Playwright no activa los controles nativos: se da foco al video y se pulsa la barra espaciadora.
- **`check-names.sh todo`:** la comprobación de nombres en español (`api/`, `frontend/` y `scripts/`) termina con código 0.
- **`tiene_video` en `ClaseTemario`:** para los enlaces "Ver clase" del administrador la API devuelve un booleano por clase, calculado con `EXISTS` sobre el video vigente y `listo`. Es solo el dato: ni rutas de Storage ni claves. Aparece también en `curso(slug)` (dato público, sin riesgo). Se actualizaron el esquema, el manifiesto (cambió el hash de `cursos_en_revision`), los esquemas de Zod y las pruebas de la API.
- **Endurecimiento de la marca de agua:** además de lo anterior se vigilan `color` y `-webkit-text-fill-color` con alfa menor de 0,1, la opacidad efectiva (producto de la marca y todos sus ancestros) menor de 0,1, `display: none` y `visibility` heredados, `filter` (opacity o brightness menores de 0,1, blur de más de 3 px), `clip-path`, `mask-image`, `mix-blend-mode` distinto de `normal`, letra o caja menores de 8 px, texto recortado o fuera del contenedor y que otro elemento la cubra (`document.elementFromPoint` en su centro). **Descartado por falsos positivos:** la cabecera fija del sitio (sticky) y los controles propios (`data-player-ui`) no cuentan como tapadores; si el centro queda fuera de la ventana no se evalúa. **No se detecta** un tapador con `pointer-events: none`. La restauración se limita a una por segundo: sin ese límite, un tapador que no se puede quitar provocaba un bucle de renderizados que congelaba la página.
- **Renovación ante URL vencida:** `hls.js` reintentaba el fragmento unos 30 s con espera creciente antes de declarar el error fatal. Ahora un 401 o 403 de segmento o clave renueva la autorización de inmediato (una vez), y la prueba (403 simulado con `page.route` hasta renovar) es estable. Si la renovación misma falla, antes no se avisaba: ahora se muestra el mensaje en español de la API más "Recarga la página para seguir viendo la clase.".
- **Pruebas de la API sin datos copiados:** `catalog`, `review` y `courses` suponían categorías y cursos ya existentes en la base y fallaban en una base limpia. Ahora crean su propia categoría (`zz-e2e-cat-*`) y un curso publicado de otro nivel, y las borran al terminar.
- **Limitaciones que siguen:** el navegador debe recibir clave y segmentos (ver "Límite"); la marca vive en el cliente; no hay DRM, auditoría de visualizaciones ni rotación de claves; el proxy `/almacen` de las URL firmadas solo existe en el servidor de desarrollo de Astro.

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **El video se puede copiar con las herramientas del navegador** durante la vida de la autorización: la clave y los segmentos llegan al navegador por diseño | Es el límite de cualquier reproducción web sin DRM. Se reduce con la vida de 10 minutos, el token atado a una cuenta y un video, y la marca de agua con el correo que identifica la copia. DRM comercial es otra spec si el negocio lo exige |
| La marca de agua solo existe en el cliente: quien manipule el navegador puede quitarla | La vigilancia la reinstala y pausa el video, pero no es infalible. La protección real es disuasoria y de trazabilidad |
| La renovación de la autorización recarga la lista y puede notarse un corte | Se renueva con anticipación y en el mismo segundo, y se prueba con el reloj adelantado. Las clases recomendadas (hasta 9 minutos) casi no renuevan |
| Firmar cientos de segmentos de una clase de 30 minutos tarda | Una sola llamada por lotes a Storage, y se mide en el paso 2. Si el endpoint por lotes no existe tal cual, se ajusta la spec |
| `hls.js` no funciona sin MSE (iPhone con iOS anterior a 17.1) | Mensaje claro en español; queda fuera de alcance |
| Un token de reproducción filtrado sirve hasta 10 minutos para ese video | Vida corta, atado a un video y una cuenta, y la marca de agua |
| Las URL firmadas pasan por el proxy `/almacen` del servidor de desarrollo de Astro | Igual que las portadas y las subidas; en producción hará falta un proxy inverso (fuera de alcance, como TLS) |
| Todas las rutas pasan por el límite de 120 peticiones por minuto por IP | La lista y la clave se piden pocas veces por clase; los segmentos van directo a Storage y no cuentan |

## Qué **no** hay en esta spec

- Inscripción, avance y acceso según la inscripción (SPEC 13).
- DRM comercial y cualquier garantía absoluta contra la copia del video.
- Marca de agua quemada, auditoría de visualizaciones y analítica.
- Rotación de claves, varias calidades, subtítulos, capítulos y descargas sin conexión.
- Soporte de navegadores sin MSE.

Cada uno de esos puntos, si llega, va en su propia spec.
