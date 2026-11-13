import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  session_id?: string;
  user_metadata?: { nombre?: unknown };
  [key: string]: unknown;
}

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience?: string;
  now?: () => number; // segundos Unix; se inyecta en las pruebas
}

// Los tres segmentos base64url, con los mismos límites de tamaño que usaba el workflow de cierre de sesión.
const JWT_FORMAT = /^[A-Za-z0-9_-]{10,2048}\.[A-Za-z0-9_-]{10,2048}\.[A-Za-z0-9_-]{10,2048}$/;

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Verifica un JWT de Supabase Auth en local: HS256, firma, `aud`, `iss` y `exp`. Devuelve la carga o `null`.
export function verifyJwt(token: string, options: JwtOptions): JwtPayload | null {
  if (!JWT_FORMAT.test(token)) return null;
  const [header, payload, signature] = token.split('.');
  const decodedHeader = decodeJson(header);
  if (decodedHeader?.alg !== 'HS256') return null; // rechaza `none` y cualquier otro algoritmo

  const expected = createHmac('sha256', options.secret).update(`${header}.${payload}`).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  const data = decodeJson(payload);
  if (data === null) return null;
  const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();
  if (typeof data.exp !== 'number' || data.exp <= now) return null;
  if (typeof data.nbf === 'number' && data.nbf > now) return null;
  if (data.iss !== options.issuer) return null;
  const audience = options.audience ?? 'authenticated';
  const audiences = Array.isArray(data.aud) ? data.aud : [data.aud];
  if (!audiences.includes(audience)) return null;
  if (typeof data.sub !== 'string' || data.sub === '') return null;
  return data as JwtPayload;
}
