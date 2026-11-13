import { ConfigService } from '@nestjs/config';
import { signJwt } from '../../security/utils/sign-jwt';
import { PlaybackTokenService } from './playback-token.service';

const SECRET = 'secreto-de-prueba-secreto-de-prueba';
const ISSUER = 'http://localhost:8000';
const NOW = 1_800_000_000;
const config = (seconds = 600) =>
  ({ getOrThrow: (key: string) => (key === 'jwt' ? { secret: SECRET, issuer: ISSUER } : { authorizationSeconds: seconds }) }) as unknown as ConfigService;
const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

describe('PlaybackTokenService', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000));
  afterEach(() => jest.restoreAllMocks());

  it('emite un JWT con iss, aud reproduccion, sub, vid, cid, iat y exp = iat + vida', () => {
    const { token, expiresIn } = new PlaybackTokenService(config(600)).issue({ userId: 'u-1', videoId: 31, lessonId: 7 });
    expect(expiresIn).toBe(600);
    expect(decode(token)).toEqual({ iss: ISSUER, aud: 'reproduccion', sub: 'u-1', vid: 31, cid: 7, iat: NOW, exp: NOW + 600 });
  });

  it('la vida sale de SEGUNDOS_AUTORIZACION_REPRODUCCION', () => {
    const service = new PlaybackTokenService(config(60));
    expect(decode(service.issue({ userId: 'u', videoId: 1, lessonId: 1 }).token).exp).toBe(NOW + 60);
  });

  it('verifica su propio token y devuelve cuenta, video y clase', () => {
    const service = new PlaybackTokenService(config());
    const { token } = service.issue({ userId: 'u-1', videoId: 31, lessonId: 7 });
    expect(service.verify(`Bearer ${token}`)).toEqual({ userId: 'u-1', videoId: 31, lessonId: 7 });
  });

  it('rechaza con 401 TOKEN_INVALIDO: sin cabecera, sin Bearer, firma ajena, audiencia de acceso, caducado y sin vid', () => {
    const service = new PlaybackTokenService(config());
    const base = { iss: ISSUER, aud: 'reproduccion', sub: 'u-1', vid: 1, cid: 1, iat: NOW, exp: NOW + 600 };
    const bad = [
      undefined,
      '',
      'Basic abc',
      `Bearer ${signJwt(base, 'otra-clave-otra-clave-otra')}`,
      `Bearer ${signJwt({ ...base, aud: 'authenticated' }, SECRET)}`,
      `Bearer ${signJwt({ ...base, exp: NOW - 1 }, SECRET)}`,
      `Bearer ${signJwt({ ...base, vid: undefined }, SECRET)}`,
      `Bearer ${signJwt({ ...base, vid: '1' }, SECRET)}`,
      `Bearer ${signJwt({ ...base, iss: 'http://otro' }, SECRET)}`,
    ];
    for (const header of bad) expect(() => service.verify(header)).toThrow(expect.objectContaining({ code: 'TOKEN_INVALIDO' }));
  });
});
