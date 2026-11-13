import { signJwt } from './sign-jwt';
import { verifyJwt } from './verify-jwt';

const SECRET = 'secreto-de-prueba-secreto-de-prueba';
const ISSUER = 'http://localhost:8000';
const NOW = 1_800_000_000;
const payload = { sub: 'u-1', aud: 'reproduccion', iss: ISSUER, iat: NOW, exp: NOW + 600, vid: 7 };

describe('signJwt', () => {
  it('produce un HS256 con tres segmentos que verifyJwt acepta', () => {
    const token = signJwt(payload, SECRET);
    expect(token.split('.')).toHaveLength(3);
    expect(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: 'reproduccion', now: () => NOW })).toMatchObject({ sub: 'u-1', vid: 7 });
  });
  it('no vale con otra clave, otra audiencia ni caducado', () => {
    const token = signJwt(payload, SECRET);
    expect(verifyJwt(token, { secret: 'otra-clave-otra-clave-otra', issuer: ISSUER, audience: 'reproduccion', now: () => NOW })).toBeNull();
    expect(verifyJwt(token, { secret: SECRET, issuer: ISSUER, now: () => NOW })).toBeNull(); // audiencia `authenticated`
    expect(verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: 'reproduccion', now: () => NOW + 600 })).toBeNull();
  });
  it('una carga manipulada invalida la firma', () => {
    const [header, , signature] = signJwt(payload, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, vid: 8 })).toString('base64url');
    expect(verifyJwt(`${header}.${forged}.${signature}`, { secret: SECRET, issuer: ISSUER, audience: 'reproduccion', now: () => NOW })).toBeNull();
  });
});
