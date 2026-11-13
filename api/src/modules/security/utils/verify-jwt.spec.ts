import { createHmac } from 'node:crypto';
import { verifyJwt } from './verify-jwt';

const SECRET = 'secreto-de-prueba-secreto-de-prueba';
const ISSUER = 'http://localhost:8000';
const NOW = 1_800_000_000;
const options = { secret: SECRET, issuer: ISSUER, now: () => NOW };

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload: Record<string, unknown>, { secret = SECRET, header = { alg: 'HS256', typ: 'JWT' } } = {}): string {
  const body = `${b64(header)}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const good = { sub: 'u-1', email: 'a@b.co', role: 'authenticated', aud: 'authenticated', iss: ISSUER, exp: NOW + 900 };

describe('verificarJwt', () => {
  it('acepta un token válido', () => expect(verifyJwt(sign(good), options)).toMatchObject({ sub: 'u-1', email: 'a@b.co' }));
  it('rechaza una firma de otra clave', () => expect(verifyJwt(sign(good, { secret: 'otra-clave-otra-clave-otra' }), options)).toBeNull());
  it('rechaza un token caducado (y exp igual a ahora)', () => {
    expect(verifyJwt(sign({ ...good, exp: NOW - 1 }), options)).toBeNull();
    expect(verifyJwt(sign({ ...good, exp: NOW }), options)).toBeNull();
  });
  it('rechaza si falta exp o no es número', () => {
    expect(verifyJwt(sign({ ...good, exp: undefined }), options)).toBeNull();
    expect(verifyJwt(sign({ ...good, exp: String(NOW + 900) }), options)).toBeNull();
  });
  it('rechaza otro emisor o audiencia', () => {
    expect(verifyJwt(sign({ ...good, iss: 'http://otro' }), options)).toBeNull();
    expect(verifyJwt(sign({ ...good, aud: 'anon' }), options)).toBeNull();
    expect(verifyJwt(sign({ ...good, aud: undefined }), options)).toBeNull();
  });
  it('acepta la audiencia dentro de un arreglo', () => {
    expect(verifyJwt(sign({ ...good, aud: ['x', 'authenticated'] }), options)).not.toBeNull();
  });
  it('rechaza alg distinto de HS256, incluido none', () => {
    expect(verifyJwt(sign(good, { header: { alg: 'HS512', typ: 'JWT' } }), options)).toBeNull();
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(good)}.${'a'.repeat(20)}`;
    expect(verifyJwt(unsigned, options)).toBeNull();
  });
  it('rechaza si falta sub o nbf es futuro', () => {
    expect(verifyJwt(sign({ ...good, sub: '' }), options)).toBeNull();
    expect(verifyJwt(sign({ ...good, nbf: NOW + 60 }), options)).toBeNull();
  });
  it('rechaza basura, tokens manipulados y formatos incorrectos', () => {
    expect(verifyJwt('', options)).toBeNull();
    expect(verifyJwt('a.b.c', options)).toBeNull();
    expect(verifyJwt('no es un jwt', options)).toBeNull();
    const [c, p, f] = sign(good).split('.');
    expect(verifyJwt(`${c}.${b64({ ...good, sub: 'otro' })}.${f}`, options)).toBeNull();
    expect(verifyJwt(`${c}.${p}.${f.slice(0, -2)}`, options)).toBeNull();
  });
  it('una carga que no es objeto se rechaza', () => {
    const body = `${b64({ alg: 'HS256' })}.${b64([1, 2])}`;
    expect(verifyJwt(`${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`, options)).toBeNull();
  });
});
