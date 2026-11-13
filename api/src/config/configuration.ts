// Variables de entorno de la API, validadas al arrancar: si falta una o es inválida, el proceso no arranca.
// Los mensajes dicen qué variable falla, nunca su valor.
export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  port: number;
  frontOrigin: string;
  trustedProxies: string[];
  // Supabase Auth: dirección interna y tiempo máximo de espera de cada llamada.
  // `serviceKey` (SERVICE_ROLE_KEY) solo se usa para la API admin de Supabase Auth; nunca sale en una respuesta.
  auth: { url: string; timeoutMs: number; serviceKey: string };
  // Verificación local de los tokens de acceso (HS256): clave y emisor (`iss`).
  jwt: { secret: string; issuer: string };
  // Supabase Storage: dirección interna y tiempo máximo de espera de cada llamada (usa `auth.serviceKey` para autenticarse).
  storage: { url: string; timeoutMs: number };
  // Reproducción protegida (SPEC 12): vida en segundos del token de reproducción y de las URL firmadas de los segmentos.
  playback: { authorizationSeconds: number };
  // Transcodificador de videos (red interna): dirección, secreto compartido (cabecera `X-Secreto-Transcodificador`, en los dos
  // sentidos; nunca sale en una respuesta ni en el registro) y tiempo máximo de espera al pedirle un trabajo.
  transcoder: { url: string; secret: string; timeoutMs: number };
  // Correo saliente por SMTP, sin TLS ni autenticación (Mailpit en local).
  mail: { host: string; port: number };
  db: { host: string; port: number; name: string; user: string; password: string };
}

// Solo loopback y las redes privadas que usa Docker; de ahí sí se cree en `X-Forwarded-For`.
const DEFAULT_TRUSTED_PROXIES = 'loopback,172.16.0.0/12,192.168.0.0/16';

type Environment = Record<string, string | undefined>;

function text(env: Environment, key: string, fallback?: string): string {
  const value = env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${key}`);
  }
  return value;
}

function validPort(env: Environment, key: string, fallback: string): number {
  const value = Number(text(env, key, fallback));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`La variable de entorno ${key} debe ser un puerto entre 1 y 65535`);
  }
  return value;
}

function validUrl(env: Environment, key: string, fallback: string): string {
  const value = text(env, key, fallback);
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value.replace(/\/+$/, '');
  } catch {
    // cae al error de abajo
  }
  throw new Error(`La variable de entorno ${key} debe ser una URL http o https`);
}

function validInteger(env: Environment, key: string, fallback: string, min: number, max: number): number {
  const value = Number(text(env, key, fallback));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`La variable de entorno ${key} debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

export function readConfig(env: Environment = process.env): AppConfig {
  const environment = text(env, 'NODE_ENV', 'development');
  if (!['development', 'production', 'test'].includes(environment)) {
    throw new Error('NODE_ENV debe ser development, production o test');
  }
  return {
    environment: environment as AppConfig['environment'],
    port: validPort(env, 'PUERTO', '3000'),
    frontOrigin: text(env, 'ORIGEN_FRONT'),
    trustedProxies: text(env, 'PROXIES_CONFIANZA', DEFAULT_TRUSTED_PROXIES).split(',').map((p) => p.trim()).filter(Boolean),
    auth: {
      url: text(env, 'URL_SUPABASE_AUTH', 'http://auth:9999').replace(/\/+$/, ''),
      timeoutMs: Number(text(env, 'TIEMPO_ESPERA_AUTH_MS', '8000')),
      serviceKey: text(env, 'SERVICE_ROLE_KEY'),
    },
    jwt: { secret: text(env, 'JWT_SECRET'), issuer: text(env, 'API_EXTERNAL_URL') },
    storage: { url: validUrl(env, 'URL_STORAGE', 'http://storage:5000'), timeoutMs: Number(text(env, 'TIEMPO_ESPERA_STORAGE_MS', '15000')) },
    playback: { authorizationSeconds: validInteger(env, 'SEGUNDOS_AUTORIZACION_REPRODUCCION', '600', 60, 3600) },
    transcoder: {
      url: validUrl(env, 'URL_TRANSCODIFICADOR', 'http://transcodificador:8090'),
      secret: text(env, 'SECRETO_TRANSCODIFICADOR'),
      timeoutMs: Number(text(env, 'TIEMPO_ESPERA_TRANSCODIFICADOR_MS', '10000')),
    },
    mail: { host: text(env, 'SMTP_HOST', 'mailpit'), port: validPort(env, 'SMTP_PORT', '1025') },
    db: {
      host: text(env, 'BD_HOST', 'db'),
      port: validPort(env, 'BD_PUERTO', '5432'),
      name: text(env, 'BD_NOMBRE', 'plataforma'),
      user: text(env, 'USUARIO_BD_PLATAFORMA'),
      password: text(env, 'CONTRASENA_BD_PLATAFORMA'),
    },
  };
}
