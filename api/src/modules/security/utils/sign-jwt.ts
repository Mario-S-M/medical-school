import { createHmac } from 'node:crypto';

// Firma un JWT HS256 con `node:crypto`. Lo usa el token de reproducción (SPEC 12); `verifyJwt` lo verifica.
export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
