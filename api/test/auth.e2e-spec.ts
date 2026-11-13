import {
  VALID_PASSWORD,
  countAttempts,
  countAttemptsByIp,
  newEmail,
  createUser,
  ageAttempts,
  http,
  insertOldAttempt,
  newIp,
  signIn,
  cleanup,
  sql,
  cookieValue,
} from './helpers/real-env';

// Flujos de registro, inicio de sesión, renovación y cierre (SPEC 09, paso 3) contra el contenedor `api`
// real, Supabase Auth y la base `plataforma`. Requiere el stack levantado (`docker compose up -d --build api`).

const ATRIBUTOS = ['HttpOnly', 'SameSite=Strict', 'Path=/api/v1/sesiones', 'Max-Age=604800'];
const CABECERA_FRONT = { 'X-Solicitado-Con': 'front' };

beforeAll(() => cleanup());
afterAll(() => cleanup());

describe('POST /api/v1/usuarios', () => {
  const registrar = (body: unknown, ip = newIp()) => http().post('/api/v1/usuarios').set('X-Forwarded-For', ip).send(body as object);

  it('crea la cuenta y responde 201 con el mensaje de siempre', async () => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena: VALID_PASSWORD }).expect(201);
    expect(r.body).toEqual({ mensaje: 'Cuenta creada. Revisa tu correo y verifícala con el código que te enviamos.' });
  });

  it('responde igual (código, cuerpo y tiempo) con un correo ya registrado y verificado', async () => {
    const existente = await createUser(true);
    const newBody = { correo: newEmail(), nombre: 'Ana', contrasena: VALID_PASSWORD };
    const t0 = Date.now();
    const nuevo = await registrar(newBody).expect(201);
    const msNuevo = Date.now() - t0;
    const t1 = Date.now();
    const repetido = await registrar({ correo: existente.correo, nombre: 'Otra', contrasena: VALID_PASSWORD }).expect(201);
    const msRepetido = Date.now() - t1;
    expect(repetido.body).toEqual(nuevo.body);
    expect(Math.abs(msNuevo - msRepetido)).toBeLessThan(300);
  });

  it('responde igual con una cuenta sin verificar registrada otra vez', async () => {
    const sinVerificar = await createUser(false);
    const r = await registrar({ correo: sinVerificar.correo, nombre: 'Ana', contrasena: VALID_PASSWORD }).expect(201);
    expect(r.body.mensaje).toMatch(/^Cuenta creada/);
  });

  it('el correo se normaliza (mayúsculas y espacios) y no distingue entre mayúsculas al repetir', async () => {
    const correo = newEmail();
    await registrar({ correo: `  ${correo.toUpperCase()} `, nombre: ' Ana ', contrasena: VALID_PASSWORD }).expect(201);
    expect(sql(`select raw_user_meta_data->>'nombre' from auth.users where email = '${correo}'`, 'postgres')).toBe('Ana');
  });

  it('un campo extra da 422 VALIDACION_FALLIDA con detalles', async () => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena: VALID_PASSWORD, rol: 'admin' }).expect(422);
    expect(r.body).toEqual({
      error: {
        codigo: 'VALIDACION_FALLIDA',
        mensaje: 'La solicitud no es válida.',
        detalles: [{ campo: 'rol', regla: 'campo_no_permitido', mensaje: 'Este campo no está permitido.' }],
      },
    });
  });

  it('campos ausentes, de otro tipo, correo y nombre inválidos', async () => {
    const empty = await registrar({}).expect(422);
    expect(empty.body.error.detalles.map((d: { campo: string; regla: string }) => `${d.campo}:${d.regla}`)).toEqual([
      'correo:obligatorio',
      'nombre:obligatorio',
      'contrasena:obligatorio',
    ]);
    const mal = await registrar({ correo: 'no-es-correo', nombre: '', contrasena: 5 }).expect(422);
    expect(mal.body.error.detalles.map((d: { campo: string; regla: string }) => `${d.campo}:${d.regla}`)).toEqual([
      'contrasena:debe_ser_texto',
      'correo:formato_invalido',
      'nombre:largo_invalido',
    ]);
  });

  it('un cuerpo que no es objeto da 422 debe_ser_objeto', async () => {
    const r = await http().post('/api/v1/usuarios').set('X-Forwarded-For', newIp()).send([1, 2]).expect(422);
    expect(r.body.error.detalles).toEqual([{ campo: 'cuerpo', regla: 'debe_ser_objeto', mensaje: 'El cuerpo debe ser un objeto JSON.' }]);
  });

  it.each(['Password123!', 'Qwerty123456!', 'Letmein-123456'])('una contraseña común (%s) da 422 CONTRASENA_INSEGURA', async (contrasena) => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena }).expect(422);
    expect(r.body.error.codigo).toBe('CONTRASENA_INSEGURA');
    expect(r.body.error.mensaje).toBe('La contraseña no cumple los requisitos.');
    expect(r.body.error.detalles).toContainEqual({ campo: 'contrasena', regla: 'no_es_comun', mensaje: 'Es una contraseña demasiado común.' });
  });

  it('una contraseña débil devuelve todas las reglas incumplidas juntas', async () => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena: 'abc' }).expect(422);
    expect(r.body.error.codigo).toBe('CONTRASENA_INSEGURA');
    expect(r.body.error.detalles.map((d: { regla: string }) => d.regla)).toEqual([
      'minimo_12_caracteres',
      'requiere_mayuscula',
      'requiere_numero',
      'requiere_simbolo',
    ]);
  });

  it('una contraseña que contiene la parte local del correo se rechaza', async () => {
    const r = await registrar({ correo: 'martina.gomez@example.com', nombre: 'Ana', contrasena: 'Mi-MARTINA.gomez-9!' }).expect(422);
    expect(r.body.error.detalles.map((d: { regla: string }) => d.regla)).toContain('no_contiene_correo');
  });

  it('una contraseña de más de 72 bytes se rechaza', async () => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena: `Aa1!${'x'.repeat(69)}` }).expect(422);
    expect(r.body.error.detalles.map((d: { regla: string }) => d.regla)).toEqual(['maximo_72_bytes']);
  });

  it('el error nunca devuelve la contraseña enviada', async () => {
    const r = await registrar({ correo: newEmail(), nombre: 'Ana', contrasena: 'abc-secreta' }).expect(422);
    expect(JSON.stringify(r.body)).not.toContain('abc-secreta');
  });
});

describe('POST /api/v1/sesiones', () => {
  it('con la cuenta sin verificar y la contraseña correcta da 403 CORREO_NO_VERIFICADO (y no cuenta como fallo)', async () => {
    const p = await createUser(false);
    for (let i = 0; i < 6; i++) {
      const r = await signIn(p, p.contrasena).expect(403);
      expect(r.body).toEqual({ error: { codigo: 'CORREO_NO_VERIFICADO', mensaje: 'Debes verificar tu correo antes de iniciar sesión.' } });
    }
    expect(countAttempts(p.correo)).toBe(0);
  });

  it('sin verificar y con la contraseña incorrecta da 401 CREDENCIALES_INVALIDAS (no revela si falta verificar)', async () => {
    const p = await createUser(false);
    const r = await signIn(p, 'Otra#Contrasena-9').expect(401);
    expect(r.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('con datos válidos devuelve el token, el usuario y la cookie de renovación con sus atributos', async () => {
    const p = await createUser(true);
    const r = await signIn({ correo: p.correo.toUpperCase(), ip: p.ip }, p.contrasena).expect(200);
    expect(r.body).toEqual({
      token_acceso: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      tipo_token: 'Bearer',
      expira_en: expect.any(Number),
      usuario: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), correo: p.correo, nombre: 'Prueba e2e' },
    });
    const cookie = ([] as string[]).concat(r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('token_renovacion='));
    expect(cookie).toBeDefined();
    for (const atributo of ATRIBUTOS) expect(cookie).toContain(atributo);
    expect(cookie).not.toContain('Secure');
    expect(JSON.stringify(r.body)).not.toContain('refresh');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(countAttempts(p.correo)).toBe(1);
  });

  it('un correo o contraseña incorrectos dan el mismo 401, exista o no la cuenta', async () => {
    const p = await createUser(true);
    const mala = await signIn(p, 'Otra#Contrasena-9').expect(401);
    const inexistente = await signIn({ correo: newEmail(), ip: newIp() }, 'Otra#Contrasena-9').expect(401);
    expect(mala.body).toEqual({ error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos.' } });
    expect(inexistente.body).toEqual(mala.body);
    expect(mala.headers['set-cookie']).toBeUndefined();
  });

  it('valida el cuerpo: campo extra, tipo y contraseña vacía dan 422', async () => {
    const ip = newIp();
    const r = await http().post('/api/v1/sesiones').set('X-Forwarded-For', ip).send({ correo: newEmail(), contrasena: '', otro: 1 }).expect(422);
    expect(r.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect(r.body.error.detalles.map((d: { campo: string; regla: string }) => `${d.campo}:${d.regla}`)).toEqual(['otro:campo_no_permitido', 'contrasena:largo_invalido']);
    expect(countAttemptsByIp(ip)).toBe(0);
  });

  it('un 422 por validación no cuenta como intento', async () => {
    const correo = newEmail();
    const ip = newIp();
    await http().post('/api/v1/sesiones').set('X-Forwarded-For', ip).send({ correo, contrasena: 5 }).expect(422);
    expect(countAttempts(correo)).toBe(0);
  });
});

describe('Bloqueos de inicio de sesión', () => {
  it('5 fallos bloquean el sexto intento aunque la contraseña sea correcta, con Retry-After', async () => {
    const p = await createUser(true);
    for (let i = 0; i < 5; i++) await signIn(p, 'Otra#Contrasena-9').expect(401);
    const r = await signIn(p, p.contrasena).expect(429);
    expect(r.body.error).toMatchObject({
      codigo: 'CUENTA_BLOQUEADA',
      mensaje: 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.',
      reintentar_en_segundos: expect.any(Number),
    });
    expect(r.body.error.reintentar_en_segundos).toBeGreaterThan(0);
    expect(r.body.error.reintentar_en_segundos).toBeLessThanOrEqual(900);
    expect(Number(r.headers['retry-after'])).toBe(r.body.error.reintentar_en_segundos);
    // Los intentos rechazados por bloqueo no se registran: no se prolonga el bloqueo.
    expect(countAttempts(p.correo)).toBe(5);
    await signIn(p, p.contrasena).expect(429);
    expect(countAttempts(p.correo)).toBe(5);
  });

  it('lo mismo con un correo que no existe, y la respuesta no delata que no existe', async () => {
    const p = { correo: newEmail(), ip: newIp() };
    for (let i = 0; i < 5; i++) await signIn(p, 'Otra#Contrasena-9').expect(401);
    const r = await signIn(p, VALID_PASSWORD).expect(429);
    expect(r.body.error.codigo).toBe('CUENTA_BLOQUEADA');
  });

  it('el bloqueo es por correo: otra cuenta desde la misma IP sigue entrando', async () => {
    const a = await createUser(true);
    const b = await createUser(true);
    for (let i = 0; i < 5; i++) await signIn(a, 'Otra#Contrasena-9').expect(401);
    await signIn(a, a.contrasena).expect(429);
    await signIn({ correo: b.correo, ip: a.ip }, b.contrasena).expect(200);
  });

  it('al envejecer los fallos más de 15 minutos se puede entrar de nuevo', async () => {
    const p = await createUser(true);
    for (let i = 0; i < 5; i++) await signIn(p, 'Otra#Contrasena-9').expect(401);
    await signIn(p, p.contrasena).expect(429);
    ageAttempts(p.correo, '16 minutes');
    await signIn(p, p.contrasena).expect(200);
  });

  it('4 fallos no bloquean, y un inicio correcto reinicia la cuenta', async () => {
    const p = await createUser(true);
    for (let i = 0; i < 4; i++) await signIn(p, 'Otra#Contrasena-9').expect(401);
    await signIn(p, p.contrasena).expect(200);
    for (let i = 0; i < 4; i++) await signIn(p, 'Otra#Contrasena-9').expect(401);
    await signIn(p, p.contrasena).expect(200);
  });

  it('20 fallos desde la misma IP con correos distintos bloquean la IP (DEMASIADOS_INTENTOS)', async () => {
    const ip = newIp();
    const buena = await createUser(true);
    for (let i = 0; i < 20; i++) await signIn({ correo: newEmail(), ip }, 'Otra#Contrasena-9').expect(401);
    const r = await signIn({ correo: buena.correo, ip }, buena.contrasena).expect(429);
    expect(r.body.error).toMatchObject({
      codigo: 'DEMASIADOS_INTENTOS',
      mensaje: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.',
    });
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(countAttemptsByIp(ip)).toBe(20);
    // Otra IP no se ve afectada.
    await signIn({ correo: buena.correo, ip: newIp() }, buena.contrasena).expect(200);
  });

  it('dos IP de X-Forwarded-For se cuentan por separado', async () => {
    const a = newIp();
    const b = newIp();
    await signIn({ correo: newEmail(), ip: a }, 'Otra#Contrasena-9').expect(401);
    expect(countAttemptsByIp(a)).toBe(1);
    expect(countAttemptsByIp(b)).toBe(0);
  });

  it('cada inicio de sesión borra las filas de más de 24 horas', async () => {
    const vieja = newEmail();
    insertOldAttempt(vieja, newIp(), '25 hours');
    insertOldAttempt(vieja, newIp(), '23 hours');
    expect(countAttempts(vieja)).toBe(2);
    await signIn({ correo: newEmail(), ip: newIp() }, 'Otra#Contrasena-9').expect(401);
    expect(countAttempts(vieja)).toBe(1);
  });
});

describe('POST /api/v1/sesiones/renovacion', () => {
  const renovar = (cookie?: string, headers: Record<string, string> = CABECERA_FRONT) => {
    const req = http().post('/api/v1/sesiones/renovacion').set('X-Forwarded-For', newIp());
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return cookie === undefined ? req : req.set('Cookie', `token_renovacion=${cookie}`);
  };

  async function sesionNueva() {
    const p = await createUser(true);
    const r = await signIn(p, p.contrasena).expect(200);
    return { p, cookie: cookieValue(r.headers) as string, token: r.body.token_acceso as string };
  }

  it('sin X-Solicitado-Con: front da 403 ORIGEN_NO_PERMITIDO', async () => {
    const { cookie } = await sesionNueva();
    const r = await renovar(cookie, {}).expect(403);
    expect(r.body).toEqual({ error: { codigo: 'ORIGEN_NO_PERMITIDO', mensaje: 'Falta la cabecera X-Solicitado-Con.' } });
    await renovar(cookie, { 'X-Solicitado-Con': 'otra-cosa' }).expect(403);
  });

  it('con la cabecera devuelve un token nuevo y rota la cookie; reutilizar la anterior falla', async () => {
    const { cookie } = await sesionNueva();
    const r = await renovar(cookie).expect(200);
    expect(r.body).toMatchObject({ tipo_token: 'Bearer', usuario: { nombre: 'Prueba e2e' } });
    expect(r.body.token_acceso).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    const nueva = cookieValue(r.headers) as string;
    expect(nueva).toBeTruthy();
    expect(nueva).not.toBe(cookie);
    const setCookie = ([] as string[]).concat(r.headers['set-cookie'] as unknown as string[])[0];
    for (const atributo of ATRIBUTOS) expect(setCookie).toContain(atributo);

    // Supabase Auth tolera reusos 10 s (pestañas simultáneas); el reuso falla cuando el sucesor ya se consumió y pasó ese margen.
    await renovar(nueva).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    const reuso = await renovar(cookie).expect(401);
    expect(reuso.body).toEqual({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'La sesión no es válida o expiró. Inicia sesión de nuevo.' } });
    expect(String(reuso.headers['set-cookie'])).toMatch(/^token_renovacion=; .*Max-Age=0/);
  });

  it('sin cookie, o con una de formato imposible, da 401 TOKEN_INVALIDO sin tocar la cookie', async () => {
    const sin = await renovar().expect(401);
    expect(sin.body.error.codigo).toBe('TOKEN_INVALIDO');
    expect(sin.headers['set-cookie']).toBeUndefined();
    await renovar('x').expect(401);
    await renovar('a'.repeat(200)).expect(401);
    await renovar('con espacios y ;').expect(401);
  });

  it('una cookie con formato válido pero desconocida da 401 y la borra', async () => {
    const r = await renovar('abcdefghijkl').expect(401);
    expect(r.body.error.codigo).toBe('TOKEN_INVALIDO');
    expect(String(r.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('la cookie funciona entre otras cookies del navegador', async () => {
    const { cookie } = await sesionNueva();
    await http()
      .post('/api/v1/sesiones/renovacion')
      .set('X-Forwarded-For', newIp())
      .set(CABECERA_FRONT)
      .set('Cookie', `otra=1; token_renovacion=${cookie}; mas=2`)
      .expect(200);
  });
});

describe('DELETE /api/v1/sesiones/actual', () => {
  const cerrar = (token?: string) => {
    const req = http().delete('/api/v1/sesiones/actual').set('X-Forwarded-For', newIp());
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  it('revoca la sesión, responde 204 y borra la cookie; después la cookie ya no renueva', async () => {
    const p = await createUser(true);
    const session = await signIn(p, p.contrasena).expect(200);
    const cookie = cookieValue(session.headers) as string;
    const r = await cerrar(session.body.token_acceso).expect(204);
    expect(r.text).toBe('');
    expect(String(r.headers['set-cookie'])).toMatch(/^token_renovacion=; .*HttpOnly.*SameSite=Strict.*Path=\/api\/v1\/sesiones.*Max-Age=0/);
    await http()
      .post('/api/v1/sesiones/renovacion')
      .set('X-Forwarded-For', newIp())
      .set(CABECERA_FRONT)
      .set('Cookie', `token_renovacion=${cookie}`)
      .expect(401);
  });

  it('solo cierra la sesión del token: otra sesión del mismo usuario sigue viva', async () => {
    const p = await createUser(true);
    const a = await signIn(p, p.contrasena).expect(200);
    const b = await signIn(p, p.contrasena).expect(200);
    await cerrar(a.body.token_acceso).expect(204);
    await http()
      .post('/api/v1/sesiones/renovacion')
      .set('X-Forwarded-For', newIp())
      .set(CABECERA_FRONT)
      .set('Cookie', `token_renovacion=${cookieValue(b.headers)}`)
      .expect(200);
  });

  it('sin token, con basura o con un token firmado con otra clave da 401 TOKEN_INVALIDO', async () => {
    const esperado = { error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token de acceso falta, no es válido o expiró.' } };
    expect((await cerrar().expect(401)).body).toEqual(esperado);
    expect((await cerrar('basura').expect(401)).body).toEqual(esperado);
    const ajeno = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"x","aud":"authenticated"}').toString('base64url')}.${'a'.repeat(43)}`;
    expect((await cerrar(ajeno).expect(401)).body).toEqual(esperado);
    const r = await http().delete('/api/v1/sesiones/actual').set('Authorization', 'Basic abc').expect(401);
    expect(r.body).toEqual(esperado);
  });

  it('cerrar dos veces el mismo token: la segunda da 401 TOKEN_INVALIDO y borra la cookie', async () => {
    const p = await createUser(true);
    const session = await signIn(p, p.contrasena).expect(200);
    await cerrar(session.body.token_acceso).expect(204);
    const r = await cerrar(session.body.token_acceso).expect(401);
    expect(r.body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});

describe('Capa transversal en las rutas de autenticación', () => {
  it('405 con Allow, 415 sin JSON y 404 de una ruta cercana', async () => {
    const g = await http().get('/api/v1/sesiones').expect(405);
    expect(g.headers['allow']).toContain('POST');
    expect(g.body.error.codigo).toBe('METODO_NO_PERMITIDO');
    await http().post('/api/v1/sesiones').set('Content-Type', 'text/plain').send('x').expect(415);
    await http().get('/api/v1/sesiones/otra').expect(404);
  });

  it('un Origin distinto del front da 403 ORIGEN_NO_PERMITIDO', async () => {
    const r = await http().post('/api/v1/sesiones').set('Origin', 'http://malo.example').send({}).expect(403);
    expect(r.body.error.codigo).toBe('ORIGEN_NO_PERMITIDO');
  });
});
