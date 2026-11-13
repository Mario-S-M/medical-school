import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './real-env';

// Ayudas para las pruebas con video real (SPEC 12, paso 3): ffmpeg/ffprobe del contenedor del transcodificador y Storage por Kong
// con la clave de servicio. Ningún valor secreto se imprime.

const env = (key: string): string => readFileSync(join(REPO_ROOT, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
export const STORAGE_URL = `http://127.0.0.1:${env('KONG_HTTP_PORT')}/storage/v1`;
const SERVICE_AUTH = { Authorization: `Bearer ${env('SERVICE_ROLE_KEY')}`, apikey: env('SERVICE_ROLE_KEY') };
export const TEMP = mkdtempSync(join(tmpdir(), 'playback-real-'));

function compose(args: string[], output: 'ignore' | 'text' = 'ignore'): string {
  return execFileSync('docker', ['compose', ...args], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', output === 'text' ? 'pipe' : 'ignore', 'ignore'] });
}

// Genera un MP4 (patrón de prueba + tono) con el ffmpeg del contenedor y lo trae al host.
export function generateMp4(name: string, seconds: number, size = '640x360'): string {
  const file = `pb_${process.pid}_${name}.mp4`;
  compose(['exec', '-T', 'transcodificador', 'ffmpeg', '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=25`, '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', `/trabajo/${file}`]);
  const local = join(TEMP, `${name}.mp4`);
  compose(['cp', `transcodificador:/trabajo/${file}`, local]);
  compose(['exec', '-T', 'transcodificador', 'rm', '-f', `/trabajo/${file}`]);
  return local;
}

export interface Probe {
  duration: number;
  codecs: string[];
}
// Mide un archivo TS con el ffprobe del contenedor; `null` si no es un TS válido (sin duración o sin códecs).
export function probe(content: Buffer): Probe | null {
  const name = `sonda_${process.pid}_${randomBytes(4).toString('hex')}.ts`;
  const local = join(TEMP, name);
  writeFileSync(local, content);
  compose(['cp', local, `transcodificador:/trabajo/${name}`]);
  try {
    const out = compose(['exec', '-T', 'transcodificador', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', `/trabajo/${name}`], 'text');
    const data = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_name?: string }[] };
    const duration = Number(data.format?.duration);
    const codecs = (data.streams ?? []).map((s) => s.codec_name ?? '');
    return Number.isFinite(duration) && duration > 0 && codecs.length > 0 ? { duration, codecs } : null;
  } catch {
    return null;
  } finally {
    compose(['exec', '-T', 'transcodificador', 'rm', '-f', `/trabajo/${name}`]);
  }
}

// --- Storage con la clave de servicio ---

export async function getObject(path: string): Promise<Buffer | null> {
  const r = await fetch(`${STORAGE_URL}/object/videos/${path}`, { headers: SERVICE_AUTH });
  return r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
}
type Entry = { id?: string | null; name: string };
export async function filesUnder(prefix: string): Promise<string[]> {
  const r = await fetch(`${STORAGE_URL}/object/list/videos`, { method: 'POST', headers: { ...SERVICE_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000 }) });
  const entries = (await r.json()) as Entry[];
  return (await Promise.all(entries.map((e) => (e.id ? [`${prefix}/${e.name}`] : filesUnder(`${prefix}/${e.name}`))))).flat();
}
export async function deletePrefix(prefix: string): Promise<void> {
  const paths = await filesUnder(prefix);
  if (paths.length) await fetch(`${STORAGE_URL}/object/videos`, { method: 'DELETE', headers: { ...SERVICE_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
}
