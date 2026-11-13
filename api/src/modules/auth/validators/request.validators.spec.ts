import { validateEmailOnly, validateLogin, validateRegister, validateResetPassword, validateVerifyEmail } from './request.validators';

const valid = { correo: 'ana@example.com', nombre: 'Ana', contrasena: 'x' };
const details = (r: ReturnType<typeof validateRegister>) => (r.ok ? [] : r.details.map((d) => `${d.campo}:${d.regla}`));

describe('validateRegister', () => {
  it('normaliza el correo y recorta el nombre', () => {
    expect(validateRegister({ ...valid, correo: '  ANA@Example.COM ', nombre: '  Ana María ' })).toEqual({
      ok: true,
      data: { email: 'ana@example.com', name: 'Ana María', password: 'x' },
    });
  });
  it.each([null, undefined, [], 'texto', 5])('un cuerpo que no es objeto (%p) se rechaza', (body) => {
    expect(details(validateRegister(body))).toEqual(['cuerpo:debe_ser_objeto']);
  });
  it('campo extra, primero que los obligatorios', () => {
    expect(details(validateRegister({ ...valid, rol: 'admin' }))).toEqual(['rol:campo_no_permitido']);
  });
  it('el nombre del campo extra se recorta a 40 caracteres', () => {
    const r = validateRegister({ ...valid, ['a'.repeat(100)]: 1 });
    expect(!r.ok && r.details[0].campo).toHaveLength(40);
  });
  it('campos ausentes', () => {
    expect(details(validateRegister({}))).toEqual(['correo:obligatorio', 'nombre:obligatorio', 'contrasena:obligatorio']);
  });
  it('campos que no son texto', () => {
    expect(details(validateRegister({ correo: 1, nombre: {}, contrasena: [] }))).toEqual([
      'correo:debe_ser_texto',
      'nombre:debe_ser_texto',
      'contrasena:debe_ser_texto',
    ]);
  });
  it.each(['sin-arroba', 'a@b', 'a@@b.com', '@example.com', 'a b@example.com', 'a@-b.com', 'a@b..com', ''])(
    'correo inválido %p',
    (correo) => {
      expect(details(validateRegister({ ...valid, correo }))).toEqual(['correo:formato_invalido']);
    },
  );
  it('correo con parte local de 65 caracteres o más de 254 en total', () => {
    expect(details(validateRegister({ ...valid, correo: `${'a'.repeat(65)}@example.com` }))).toEqual(['correo:formato_invalido']);
    expect(details(validateRegister({ ...valid, correo: `${'a'.repeat(64)}@example.com` }))).toEqual([]);
    expect(details(validateRegister({ ...valid, correo: `a@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(60)}.${'f'.repeat(20)}.com` }))).toEqual(['correo:formato_invalido']);
  });
  it('nombre vacío, de solo espacios o de más de 80 caracteres', () => {
    expect(details(validateRegister({ ...valid, nombre: '' }))).toEqual(['nombre:largo_invalido']);
    expect(details(validateRegister({ ...valid, nombre: '   ' }))).toEqual(['nombre:largo_invalido']);
    expect(details(validateRegister({ ...valid, nombre: 'a'.repeat(81) }))).toEqual(['nombre:largo_invalido']);
    expect(details(validateRegister({ ...valid, nombre: 'a'.repeat(80) }))).toEqual([]);
  });
  it('el largo del nombre cuenta caracteres, no unidades UTF-16', () => {
    expect(details(validateRegister({ ...valid, nombre: '😀'.repeat(80) }))).toEqual([]);
    expect(details(validateRegister({ ...valid, nombre: '😀'.repeat(81) }))).toEqual(['nombre:largo_invalido']);
  });
  it('nombre con caracteres de control', () => {
    expect(details(validateRegister({ ...valid, nombre: 'An\u0000a' }))).toEqual(['nombre:caracteres_de_control']);
    expect(details(validateRegister({ ...valid, nombre: 'An\u0085a' }))).toEqual(['nombre:caracteres_de_control']);
  });
  it('acumula todos los errores en el orden del workflow', () => {
    expect(details(validateRegister({ correo: 'mal', nombre: '', contrasena: 'x', extra: 1 }))).toEqual([
      'extra:campo_no_permitido',
      'correo:formato_invalido',
      'nombre:largo_invalido',
    ]);
  });
  it('los mensajes son los del workflow', () => {
    const r = validateRegister({});
    expect(!r.ok && r.details[0]).toEqual({ campo: 'correo', regla: 'obligatorio', mensaje: 'Este campo es obligatorio.' });
  });
});

describe('validateLogin', () => {
  it('acepta datos válidos', () => {
    expect(validateLogin({ correo: ' ANA@example.com', contrasena: ' con espacios ' })).toEqual({
      ok: true,
      data: { email: 'ana@example.com', password: ' con espacios ' }, // la contraseña no se recorta
    });
  });
  it('rechaza un campo extra, uno ausente y uno que no es texto', () => {
    expect(!validateLogin({ correo: 'a@b.co', contrasena: 1, nombre: 'x' }).ok).toBe(true);
    const r = validateLogin({ correo: 'ana@example.com', contrasena: 1, nombre: 'x' });
    expect(!r.ok && r.details.map((d) => `${d.campo}:${d.regla}`)).toEqual(['nombre:campo_no_permitido', 'contrasena:debe_ser_texto']);
  });
  it('contraseña vacía o de más de 1024 bytes', () => {
    const empty = validateLogin({ correo: 'ana@example.com', contrasena: '' });
    expect(!empty.ok && empty.details[0].regla).toBe('largo_invalido');
    expect(validateLogin({ correo: 'ana@example.com', contrasena: 'a'.repeat(1024) }).ok).toBe(true);
    expect(validateLogin({ correo: 'ana@example.com', contrasena: 'a'.repeat(1025) }).ok).toBe(false);
    expect(validateLogin({ correo: 'ana@example.com', contrasena: 'ñ'.repeat(513) }).ok).toBe(false);
  });
  it('un cuerpo que no es objeto', () => {
    const r = validateLogin([]);
    expect(!r.ok && r.details[0].regla).toBe('debe_ser_objeto');
  });
});

describe('validateEmailOnly, validateVerifyEmail y validateResetPassword', () => {
  const ok = { correo: ' Ana@Example.com ', codigo: '012345', contrasena_nueva: 'Zorro#Azul-2026x' };

  it('solo correo: normaliza y rechaza campos de más', () => {
    expect(validateEmailOnly({ correo: ' Ana@Example.com ' })).toEqual({ ok: true, data: { email: 'ana@example.com' } });
    expect(validateEmailOnly({ correo: 'a@b.co', otro: 1 })).toEqual({
      ok: false,
      details: [{ campo: 'otro', regla: 'campo_no_permitido', mensaje: 'Este campo no está permitido.' }],
    });
    expect(validateEmailOnly([])).toMatchObject({ ok: false, details: [{ regla: 'debe_ser_objeto' }] });
    expect(validateEmailOnly({})).toMatchObject({ ok: false, details: [{ campo: 'correo', regla: 'obligatorio' }] });
    expect(validateEmailOnly({ correo: 5 })).toMatchObject({ ok: false, details: [{ campo: 'correo', regla: 'debe_ser_texto' }] });
    expect(validateEmailOnly({ correo: 'sin-arroba' })).toMatchObject({ ok: false, details: [{ campo: 'correo', regla: 'formato_invalido' }] });
  });

  it('verificación: código de exactamente 6 dígitos (conserva ceros) y orden de detalles', () => {
    expect(validateVerifyEmail({ correo: ok.correo, codigo: ok.codigo })).toEqual({ ok: true, data: { email: 'ana@example.com', code: '012345' } });
    for (const bad of ['12345', '1234567', 'abcdef', '12345a', ' 12345', '１２３４５６']) {
      expect(validateVerifyEmail({ correo: 'a@b.co', codigo: bad })).toMatchObject({ ok: false, details: [{ campo: 'codigo', regla: 'formato_invalido' }] });
    }
    const r = validateVerifyEmail({ codigo: 'x', correo: 'malo', extra: true });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? [] : r.details.map((d) => `${d.campo}:${d.regla}`)).toEqual([
      'extra:campo_no_permitido',
      'correo:formato_invalido',
      'codigo:formato_invalido',
    ]);
    expect(validateVerifyEmail({ correo: 'a@b.co', codigo: 123456 })).toMatchObject({ ok: false, details: [{ campo: 'codigo', regla: 'debe_ser_texto' }] });
  });

  it('restablecimiento: exige contrasena_nueva como texto y no evalúa aquí la política', () => {
    expect(validateResetPassword(ok)).toEqual({
      ok: true,
      data: { email: 'ana@example.com', code: '012345', newPassword: 'Zorro#Azul-2026x' },
    });
    expect(validateResetPassword({ ...ok, contrasena_nueva: 'corta' })).toMatchObject({ ok: true });
    expect(validateResetPassword({ correo: ok.correo, codigo: ok.codigo })).toMatchObject({
      ok: false,
      details: [{ campo: 'contrasena_nueva', regla: 'obligatorio' }],
    });
    expect(validateResetPassword({ correo: ok.correo, codigo: ok.codigo, contrasena: 'x' })).toMatchObject({
      ok: false,
      details: [{ campo: 'contrasena', regla: 'campo_no_permitido' }, { campo: 'contrasena_nueva', regla: 'obligatorio' }],
    });
    expect(validateResetPassword({ ...ok, contrasena_nueva: 1 })).toMatchObject({ ok: false, details: [{ regla: 'debe_ser_texto' }] });
  });
});
