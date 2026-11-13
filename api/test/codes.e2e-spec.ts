import {
  Person,
  delaySend,
  deleteTestEmails,
  assertNoNewEmail,
  countEmails,
  countEvents,
  countEventsByIp,
  isEmailConfirmed,
  newEmail,
  createUser,
  waitForCode,
  waitForNewEmail,
  http,
  insertEvents,
  newIp,
  signIn,
  cleanup,
  cookieValue,
} from './helpers/real-env';

// Verificación de correo y recuperación de contraseña (SPEC 09, paso 4) contra el contenedor `api` real,
// Supabase Auth, la base `plataforma` y la API de Mailpit. Cada prueba usa su propia IP (198.18.0.0/15).

const CONTRASENA_NUEVA = 'Nuevo#Cobre-2027y';
const CABECERA_FRONT = { 'X-Solicitado-Con': 'front' };
const MENSAJES = {
  verificado: 'Correo verificado. Ya puedes iniciar sesión.',
  reenvio: 'Si el correo está registrado y sin verificar, te enviamos un código.',
  recuperacion: 'Si el correo está registrado, te enviamos un código.',
  restablecido: 'Contraseña actualizada. Inicia sesión con la nueva.',
};
const CODIGO_INVALIDO = { error: { codigo: 'CODIGO_INVALIDO', mensaje: 'El código no es válido o expiró.' } };

const post = (route: string, body: unknown, ip: string) => http().post(`/api/v1/${route}`).set('X-Forwarded-For', ip).send(body as object);
const verificar = (body: unknown, ip = newIp()) => post('verificaciones-correo', body, ip);
const reenviar = (body: unknown, ip = newIp()) => post('verificaciones-correo/reenvio', body, ip);
const recuperar = (body: unknown, ip = newIp()) => post('recuperaciones', body, ip);
const restablecer = (body: unknown, ip = newIp()) => post('recuperaciones/restablecimiento', body, ip);

// Crea la cuenta, espera el correo con el código de registro y lo devuelve (la cuenta queda sin verificar).
async function unverifiedPerson(): Promise<{ person: Person; codigo: string }> {
  const person = await createUser(false);
  return { person, codigo: await waitForCode(person.correo, 0) };
}

// Cuenta ya verificada con el código real. Devuelve cuántos correos tiene en Mailpit (registro + aviso, si lo hubiera).
async function verifiedPerson(): Promise<{ person: Person; correos: number }> {
  const { person, codigo } = await unverifiedPerson();
  await verificar({ correo: person.correo, codigo }, person.ip).expect(200);
  return { person, correos: await countEmails(person.correo) };
}

const errores422 = (r: { body: { error: { detalles: { campo: string; regla: string }[] } } }) => r.body.error.detalles.map((d) => `${d.campo}:${d.regla}`);

beforeAll(async () => {
  cleanup();
  await deleteTestEmails();
});
afterAll(async () => {
  cleanup();
  await deleteTestEmails();
});

describe('POST /api/v1/verificaciones-correo', () => {
  it('flujo completo: registro, código por correo, verificación (sin sesión) e inicio de sesión', async () => {
    const { person, codigo } = await unverifiedPerson();
    expect(isEmailConfirmed(person.correo)).toBe(false);
    await signIn(person, person.contrasena).expect(403);

    const r = await verificar({ correo: person.correo.toUpperCase(), codigo }, person.ip).expect(200);
    expect(r.body).toEqual({ mensaje: MENSAJES.verificado });
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/token/);
    expect(isEmailConfirmed(person.correo)).toBe(true);

    const sesion = await signIn(person, person.contrasena).expect(200);
    expect(sesion.body.token_acceso).toBeTruthy();
  });

  it('código erróneo: 400 CODIGO_INVALIDO y se registra un error; la cuenta sigue sin verificar', async () => {
    const { person, codigo } = await unverifiedPerson();
    const malo = codigo === '000000' ? '111111' : '000000';
    const r = await verificar({ correo: person.correo, codigo: malo }, person.ip).expect(400);
    expect(r.body).toEqual(CODIGO_INVALIDO);
    expect(countEvents(person.correo, 'verificacion', 'error')).toBe(1);
    expect(isEmailConfirmed(person.correo)).toBe(false);
  });

  it('código caducado (envío atrasado 16 minutos): 400 CODIGO_INVALIDO', async () => {
    const { person, codigo } = await unverifiedPerson();
    delaySend(person.correo, 'confirmation_sent_at', '16 minutes');
    const r = await verificar({ correo: person.correo, codigo }, person.ip).expect(400);
    expect(r.body).toEqual(CODIGO_INVALIDO);
  });

  it('correo inexistente: mismo cuerpo, byte a byte, que un código erróneo de una cuenta real', async () => {
    const { person } = await unverifiedPerson();
    const real = await verificar({ correo: person.correo, codigo: '123456' }, person.ip).expect(400);
    const fantasma = await verificar({ correo: newEmail(), codigo: '123456' }).expect(400);
    expect(fantasma.text).toBe(real.text);
  });

  it('validación: 422 VALIDACION_FALLIDA con los detalles de siempre', async () => {
    const mal = await verificar({ correo: 'sin-arroba', codigo: '12345', extra: 1 }).expect(422);
    expect(mal.body.error).toMatchObject({ codigo: 'VALIDACION_FALLIDA', mensaje: 'La solicitud no es válida.' });
    expect(errores422(mal)).toEqual(['extra:campo_no_permitido', 'correo:formato_invalido', 'codigo:formato_invalido']);
    expect(errores422(await verificar({ correo: 'a@b.co' }).expect(422))).toEqual(['codigo:obligatorio']);
    expect(errores422(await verificar({ correo: 'a@b.co', codigo: 123456 }).expect(422))).toEqual(['codigo:debe_ser_texto']);
    expect(errores422(await verificar([]).expect(422))).toEqual(['cuerpo:debe_ser_objeto']);
  });

  it('el sexto código erróneo del correo (aun con el correcto) da 429 CODIGO_BLOQUEADO con Retry-After', async () => {
    const { person, codigo } = await unverifiedPerson();
    const malo = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await verificar({ correo: person.correo, codigo: malo }).expect(400);
    const r = await verificar({ correo: person.correo, codigo }).expect(429);
    expect(r.body.error).toMatchObject({ codigo: 'CODIGO_BLOQUEADO', mensaje: 'Demasiados códigos erróneos. Inténtalo de nuevo más tarde.' });
    expect(r.body.error.reintentar_en_segundos).toBeGreaterThan(0);
    expect(Number(r.headers['retry-after'])).toBe(r.body.error.reintentar_en_segundos);
    expect(isEmailConfirmed(person.correo)).toBe(false);
    expect(countEvents(person.correo, 'verificacion', 'error')).toBe(5); // el rechazado no se registra
  });

  it('el vigésimo primer error de la misma IP da 429 DEMASIADOS_INTENTOS, aunque el correo sea otro', async () => {
    const ip = newIp();
    insertEvents(19, newEmail(), ip, 'verificacion', 'error', '1 minutes');
    await verificar({ correo: newEmail(), codigo: '123456' }, ip).expect(400); // el 20.º
    const r = await verificar({ correo: newEmail(), codigo: '123456' }, ip).expect(429);
    expect(r.body.error).toMatchObject({ codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde.' });
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(countEventsByIp(ip)).toBe(20);
  });

  it('ventana deslizante: 5 errores de hace 16 min ya no bloquean; de hace 14 min sí; los de otro propósito no cuentan por correo pero sí por IP', async () => {
    const viejo = newEmail();
    insertEvents(5, viejo, newIp(), 'verificacion', 'error', '16 minutes');
    await verificar({ correo: viejo, codigo: '123456' }).expect(400);

    const reciente = newEmail();
    insertEvents(5, reciente, newIp(), 'verificacion', 'error', '14 minutes');
    const r = await verificar({ correo: reciente, codigo: '123456' }).expect(429);
    expect(r.body.error.codigo).toBe('CODIGO_BLOQUEADO');
    expect(r.body.error.reintentar_en_segundos).toBeLessThanOrEqual(60); // el más viejo sale de la ventana en ~1 min

    const otroProposito = newEmail();
    insertEvents(5, otroProposito, newIp(), 'recuperacion', 'error', '1 minutes');
    await verificar({ correo: otroProposito, codigo: '123456' }).expect(400);

    const ip = newIp();
    insertEvents(20, newEmail(), ip, 'recuperacion', 'error', '1 minutes');
    const porIp = await verificar({ correo: newEmail(), codigo: '123456' }, ip).expect(429);
    expect(porIp.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('cada petición borra los eventos de más de 1 día', async () => {
    const correo = newEmail();
    insertEvents(3, correo, newIp(), 'verificacion', 'solicitud', '2 days');
    expect(countEvents(correo)).toBe(3);
    await verificar({ correo: newEmail(), codigo: '123456' }).expect(400);
    expect(countEvents(correo)).toBe(0);
  });
});

describe('POST /api/v1/verificaciones-correo/reenvio', () => {
  it('cuenta sin verificar: 202 y llega un código nuevo que sí verifica', async () => {
    const { person } = await unverifiedPerson();
    delaySend(person.correo, 'confirmation_sent_at', '2 minutes'); // Supabase solo reenvía 1 vez por minuto
    const r = await reenviar({ correo: person.correo }, person.ip).expect(202);
    expect(r.body).toEqual({ mensaje: MENSAJES.reenvio });
    const nuevo = await waitForCode(person.correo, 1);
    await verificar({ correo: person.correo, codigo: nuevo }, person.ip).expect(200);
    expect(countEvents(person.correo, 'verificacion', 'solicitud')).toBe(1);
  });

  it('cuenta verificada y correo inexistente: mismo 202 y mismo cuerpo, sin correo nuevo; el tiempo no los distingue', async () => {
    const { person, correos } = await verifiedPerson();
    const fantasma = newEmail();
    const t0 = Date.now();
    const real = await reenviar({ correo: person.correo }).expect(202);
    const msReal = Date.now() - t0;
    const t1 = Date.now();
    const inexistente = await reenviar({ correo: fantasma }).expect(202);
    const msInexistente = Date.now() - t1;
    expect(inexistente.text).toBe(real.text);
    expect(Math.abs(msReal - msInexistente)).toBeLessThan(300);
    await assertNoNewEmail(person.correo, correos);
    await assertNoNewEmail(fantasma, 0, 500);
  });

  it('la cuarta solicitud del mismo correo en 1 h da 429 DEMASIADOS_INTENTOS, también si no existe; la rechazada no se registra', async () => {
    const correo = newEmail();
    for (let i = 0; i < 3; i++) await reenviar({ correo }).expect(202);
    const r = await reenviar({ correo }).expect(429);
    expect(r.body.error).toMatchObject({ codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiadas solicitudes de código. Inténtalo de nuevo más tarde.' });
    expect(r.body.error.reintentar_en_segundos).toBeGreaterThan(0);
    expect(Number(r.headers['retry-after'])).toBe(r.body.error.reintentar_en_segundos);
    expect(countEvents(correo, 'verificacion', 'solicitud')).toBe(3);
  });

  it('el límite es por propósito: 3 solicitudes de recuperación no bloquean el reenvío del mismo correo', async () => {
    const correo = newEmail();
    insertEvents(3, correo, newIp(), 'recuperacion', 'solicitud', '1 minutes');
    await reenviar({ correo }).expect(202);
  });

  it('ventana deslizante: 3 solicitudes de hace 61 min no bloquean; de hace 59 min sí', async () => {
    const viejo = newEmail();
    insertEvents(3, viejo, newIp(), 'verificacion', 'solicitud', '61 minutes');
    await reenviar({ correo: viejo }).expect(202);
    const reciente = newEmail();
    insertEvents(3, reciente, newIp(), 'verificacion', 'solicitud', '59 minutes');
    const r = await reenviar({ correo: reciente }).expect(429);
    expect(r.body.error.reintentar_en_segundos).toBeLessThanOrEqual(120);
  });

  it('la undécima solicitud de la misma IP en 1 h (ambos propósitos) da 429', async () => {
    const ip = newIp();
    insertEvents(5, newEmail(), ip, 'verificacion', 'solicitud', '1 minutes');
    insertEvents(5, newEmail(), ip, 'recuperacion', 'solicitud', '1 minutes');
    const r = await reenviar({ correo: newEmail() }, ip).expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
    const otherRoute = await recuperar({ correo: newEmail() }, ip).expect(429);
    expect(otherRoute.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('validación: 422 y no se registra ningún evento', async () => {
    const ip = newIp();
    expect(errores422(await reenviar({ correo: 'xx', otro: true }, ip).expect(422))).toEqual(['otro:campo_no_permitido', 'correo:formato_invalido']);
    expect(errores422(await reenviar({}, ip).expect(422))).toEqual(['correo:obligatorio']);
    expect(countEventsByIp(ip)).toBe(0);
  });
});

describe('POST /api/v1/recuperaciones', () => {
  it('cuenta verificada: 202 y un solo correo con código de 6 dígitos y sin enlaces; correo inexistente: mismo cuerpo y sin correo', async () => {
    const { person, correos } = await verifiedPerson();
    const fantasma = newEmail();
    const real = await recuperar({ correo: person.correo }).expect(202);
    expect(real.body).toEqual({ mensaje: MENSAJES.recuperacion });
    const correo = await waitForNewEmail(person.correo, correos);
    expect(correo.text).toMatch(/\b\d{6}\b/);
    expect(correo.text).not.toMatch(/https?:\/\//);
    const inexistente = await recuperar({ correo: fantasma }).expect(202);
    expect(inexistente.text).toBe(real.text);
    await assertNoNewEmail(person.correo, correos + 1, 1000);
    await assertNoNewEmail(fantasma, 0, 1000);
  });

  it('la respuesta no espera a Supabase Auth: mismo tiempo exista o no el correo', async () => {
    const { person } = await verifiedPerson();
    const medir = async (correo: string) => {
      const t = Date.now();
      await recuperar({ correo }).expect(202);
      return Date.now() - t;
    };
    const existente = await medir(person.correo);
    const fantasma = await medir(newEmail());
    expect(Math.abs(existente - fantasma)).toBeLessThan(300);
  });

  it('la cuarta solicitud del mismo correo en 1 h da 429 DEMASIADOS_INTENTOS, exista o no', async () => {
    const correo = newEmail();
    for (let i = 0; i < 3; i++) await recuperar({ correo }).expect(202);
    const r = await recuperar({ correo }).expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('validación: 422', async () => {
    expect(errores422(await recuperar({ correo: 5 }).expect(422))).toEqual(['correo:debe_ser_texto']);
  });
});

describe('POST /api/v1/recuperaciones/restablecimiento', () => {
  async function conCodigoDeRecuperacion() {
    const { person, correos } = await verifiedPerson();
    await recuperar({ correo: person.correo }, person.ip).expect(202);
    const codigo = await waitForCode(person.correo, correos);
    return { person, correos: correos + 1, codigo };
  }

  it('flujo completo: contraseña nueva sirve, la vieja no, las sesiones anteriores caen y llega el aviso', async () => {
    const { person, correos } = await verifiedPerson();
    const sesion = await signIn(person, person.contrasena).expect(200);
    const cookie = cookieValue(sesion.headers) as string;
    const token = sesion.body.token_acceso as string;
    await http().post('/api/v1/sesiones/renovacion').set(CABECERA_FRONT).set('Cookie', `token_renovacion=${cookie}`).expect(200);

    await recuperar({ correo: person.correo }, person.ip).expect(202);
    const codigo = await waitForCode(person.correo, correos);
    const r = await restablecer({ correo: person.correo, codigo, contrasena_nueva: CONTRASENA_NUEVA }, person.ip).expect(200);
    expect(r.body).toEqual({ mensaje: MENSAJES.restablecido });
    expect(r.headers['set-cookie']).toBeUndefined();

    await signIn(person, CONTRASENA_NUEVA).expect(200);
    await signIn(person, person.contrasena).expect(401);
    // La cookie de renovación y el token de acceso de la sesión anterior ya no sirven.
    const cookieViejaUsable = await http().post('/api/v1/sesiones/renovacion').set(CABECERA_FRONT).set('Cookie', `token_renovacion=${cookie}`);
    expect(cookieViejaUsable.status).toBe(401);
    expect(cookieViejaUsable.body.error.codigo).toBe('TOKEN_INVALIDO');
    const cierre = await http().delete('/api/v1/sesiones/actual').set('Authorization', `Bearer ${token}`);
    expect(cierre.status).toBe(401);

    const aviso = await waitForNewEmail(person.correo, correos + 1); // tras el del código llega el aviso de cambio
    expect(aviso.text).not.toMatch(/\b\d{6}\b/);
  });

  it('el código se gasta: reusarlo da 400; uno caducado (envío atrasado 16 min) también', async () => {
    const usado = await conCodigoDeRecuperacion();
    await restablecer({ correo: usado.person.correo, codigo: usado.codigo, contrasena_nueva: CONTRASENA_NUEVA }).expect(200);
    const r = await restablecer({ correo: usado.person.correo, codigo: usado.codigo, contrasena_nueva: 'Otra#Clave-2028z' }).expect(400);
    expect(r.body).toEqual(CODIGO_INVALIDO);

    const vencido = await conCodigoDeRecuperacion();
    delaySend(vencido.person.correo, 'recovery_sent_at', '16 minutes');
    const v = await restablecer({ correo: vencido.person.correo, codigo: vencido.codigo, contrasena_nueva: CONTRASENA_NUEVA }).expect(400);
    expect(v.body).toEqual(CODIGO_INVALIDO);
  });

  it('contraseña débil: 422 CONTRASENA_INSEGURA sobre contrasena_nueva, sin gastar el código ni contar como error', async () => {
    const { person, codigo } = await conCodigoDeRecuperacion();
    const debil = await restablecer({ correo: person.correo, codigo, contrasena_nueva: 'corta' }).expect(422);
    expect(debil.body.error).toMatchObject({ codigo: 'CONTRASENA_INSEGURA', mensaje: 'La contraseña no cumple los requisitos.' });
    expect(errores422(debil)).toEqual([
      'contrasena_nueva:minimo_12_caracteres',
      'contrasena_nueva:requiere_mayuscula',
      'contrasena_nueva:requiere_numero',
      'contrasena_nueva:requiere_simbolo',
    ]);
    const conCorreo = await restablecer({ correo: person.correo, codigo, contrasena_nueva: `${person.correo.toUpperCase()}#9` }).expect(422);
    expect(errores422(conCorreo)).toContain('contrasena_nueva:no_contiene_correo');
    const comun = await restablecer({ correo: person.correo, codigo, contrasena_nueva: 'Password123!' }).expect(422);
    expect(errores422(comun)).toEqual(['contrasena_nueva:no_es_comun']);
    expect(countEvents(person.correo, 'recuperacion', 'error')).toBe(0);
    await restablecer({ correo: person.correo, codigo, contrasena_nueva: CONTRASENA_NUEVA }).expect(200); // el código seguía valiendo
  });

  it('contraseña igual a la actual: 422 distinta_de_la_actual y el código queda gastado', async () => {
    const { person, codigo } = await conCodigoDeRecuperacion();
    const r = await restablecer({ correo: person.correo, codigo, contrasena_nueva: person.contrasena }).expect(422);
    expect(r.body.error.codigo).toBe('CONTRASENA_INSEGURA');
    expect(errores422(r)).toEqual(['contrasena_nueva:distinta_de_la_actual']);
    await restablecer({ correo: person.correo, codigo, contrasena_nueva: CONTRASENA_NUEVA }).expect(400);
  });

  it('código erróneo y correo inexistente: 400 con cuerpos idénticos byte a byte; cada uno registra un error', async () => {
    const { person } = await verifiedPerson();
    const real = await restablecer({ correo: person.correo, codigo: '123456', contrasena_nueva: CONTRASENA_NUEVA }).expect(400);
    const fantasma = newEmail();
    const inexistente = await restablecer({ correo: fantasma, codigo: '123456', contrasena_nueva: CONTRASENA_NUEVA }).expect(400);
    expect(inexistente.text).toBe(real.text);
    expect(real.body).toEqual(CODIGO_INVALIDO);
    expect(countEvents(person.correo, 'recuperacion', 'error')).toBe(1);
    expect(countEvents(fantasma, 'recuperacion', 'error')).toBe(1);
  });

  it('el sexto código erróneo (aun con el correcto) da 429 CODIGO_BLOQUEADO; no mezcla propósitos', async () => {
    const { person, codigo } = await conCodigoDeRecuperacion();
    const malo = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await restablecer({ correo: person.correo, codigo: malo, contrasena_nueva: CONTRASENA_NUEVA }).expect(400);
    const r = await restablecer({ correo: person.correo, codigo, contrasena_nueva: CONTRASENA_NUEVA }).expect(429);
    expect(r.body.error.codigo).toBe('CODIGO_BLOQUEADO');
    expect(r.body.error.reintentar_en_segundos).toBeGreaterThan(0);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    // El bloqueo de recuperación no afecta a la verificación del mismo correo.
    await verificar({ correo: person.correo, codigo: '123456' }).expect(400);
    await signIn(person, person.contrasena).expect(200);
  });

  it('el límite de errores por IP aplica también aquí (20 por IP en 15 min)', async () => {
    const ip = newIp();
    insertEvents(20, newEmail(), ip, 'verificacion', 'error', '1 minutes');
    const r = await restablecer({ correo: newEmail(), codigo: '123456', contrasena_nueva: CONTRASENA_NUEVA }, ip).expect(429);
    expect(r.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('validación: 422 VALIDACION_FALLIDA; el campo se llama contrasena_nueva', async () => {
    const r = await restablecer({ correo: 'a@b.co', codigo: 'abc', contrasena: 'x' }).expect(422);
    expect(r.body.error.codigo).toBe('VALIDACION_FALLIDA');
    expect(errores422(r)).toEqual(['contrasena:campo_no_permitido', 'contrasena_nueva:obligatorio', 'codigo:formato_invalido']);
    expect(errores422(await restablecer({ correo: 'a@b.co', codigo: '123456', contrasena_nueva: 7 }).expect(422))).toEqual(['contrasena_nueva:debe_ser_texto']);
  });
});
