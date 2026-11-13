import { readFileSync } from 'node:fs';
import path from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';

const ROOT = path.resolve(process.cwd(), '..');

// La URL y la clave de servicio salen del .env de la raíz (nunca se imprimen ni se guardan en el repo).
function readEnv(key: string) {
  const env = readFileSync(path.join(ROOT, '.env'), 'utf8');
  return env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
}

type Entry = { id?: string | null; name: string };

async function files(api: APIRequestContext, bucket: string, prefix: string): Promise<string[]> {
  const response = await api.post(`object/list/${bucket}`, { data: { prefix, limit: 1000 } });
  const entries = (await response.json()) as Entry[];
  const nested = await Promise.all(entries.map((e) => (e.id ? [`${prefix}/${e.name}`] : files(api, bucket, `${prefix}/${e.name}`))));
  return nested.flat();
}

// Borra de un bucket de Storage todo lo que cuelga de los prefijos (recursivo) para no dejar archivos de prueba.
export async function deleteByPrefix(bucket: 'portadas' | 'videos', prefixes: string[]) {
  const key = readEnv('SERVICE_ROLE_KEY');
  const api = await request.newContext({
    baseURL: `http://127.0.0.1:${readEnv('KONG_HTTP_PORT')}/storage/v1/`,
    extraHTTPHeaders: { Authorization: `Bearer ${key}`, apikey: key },
  });
  const paths = (await Promise.all(prefixes.map((prefix) => files(api, bucket, prefix)))).flat();
  if (paths.length > 0) await api.delete(`object/${bucket}`, { data: { prefixes: paths } });
  await api.dispose();
}
