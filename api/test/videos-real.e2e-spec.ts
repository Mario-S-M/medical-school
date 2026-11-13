import { execFileSync } from 'node:child_process';
import { createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANIFEST_PATH } from '../src/modules/graphql/persisted-queries';
import { Account, GqlBody, giveRole, newAccount, removeAccountResidue } from './helpers/school-gql';
import { cleanup, http, newIp, REPO_ROOT, sql } from './helpers/real-env';

// SPEC 10, paso 10: videos de punta a punta contra el stack REAL, tal como corre en producción: contenedor `api` en
// 127.0.0.1:3000 (solo hashes persistidos; firmas por REST), Storage por Kong y el transcodificador real con ffmpeg real,
// que avisa a la API en `/api/v1/interno/video-procesado`.
// Los videos de prueba se generan con el ffmpeg del contenedor del transcodificador. Ningún valor secreto se imprime.

jest.setTimeout(240_000);

const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
const HASHES = new Map<string, string>();
for (const [hash, text] of Object.entries(MANIFEST)) {
  const name = /^(?:query|mutation)\s+(\w+)/.exec(text)?.[1];
  if (name) HASHES.set(name, hash);
}

const env = (key: string): string => readFileSync(join(REPO_ROOT, '.env'), 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
const STORAGE = `http://127.0.0.1:${env('KONG_HTTP_PORT')}/storage/v1`;
const SERVICE_AUTH = { Authorization: `Bearer ${env('SERVICE_ROLE_KEY')}`, apikey: env('SERVICE_ROLE_KEY') };
const TEMP = mkdtempSync(join(tmpdir(), 'videos-real-'));
const MAX_WAIT_MS = 120_000;

// Todo lo que devuelve la API se guarda: al final ninguna respuesta puede llevar una clave de cifrado ni `clave_hex`.
const seen: string[] = [];
const keys = new Set<string>();
const userIds: string[] = [];
const courses: number[] = [];

// Operación por hash persistido (producción no acepta consultas completas).
async function op(name: string, variables: Record<string, unknown>, token: string): Promise<GqlBody> {
  const documentId = HASHES.get(name);
  if (!documentId) throw new Error(`La operación ${name} no está en el manifiesto`);
  const r = await http().post('/api/graphql').set('X-Forwarded-For', newIp()).set('Authorization', `Bearer ${token}`).send({ documentId, variables });
  seen.push(r.text);
  expect(r.status).toBe(200);
  return r.body as GqlBody;
}

async function sign(token: string, body: object) {
  const r = await http().post('/api/v1/videos/firmas').set('X-Forwarded-For', newIp()).set('Authorization', `Bearer ${token}`).send(body);
  seen.push(r.text);
  return r;
}

// --- Storage (con la clave de servicio) ---

async function getObject(path: string): Promise<Buffer | null> {
  const r = await fetch(`${STORAGE}/object/videos/${path}`, { headers: SERVICE_AUTH });
  return r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
}
const exists = async (path: string): Promise<boolean> => (await getObject(path)) !== null;

type Entry = { id?: string | null; name: string };
async function filesUnder(prefix: string): Promise<string[]> {
  const r = await fetch(`${STORAGE}/object/list/videos`, { method: 'POST', headers: { ...SERVICE_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000 }) });
  const entries = (await r.json()) as Entry[];
  return (await Promise.all(entries.map((e) => (e.id ? [`${prefix}/${e.name}`] : filesUnder(`${prefix}/${e.name}`))))).flat();
}
async function deletePrefix(prefix: string): Promise<void> {
  const paths = await filesUnder(prefix);
  if (paths.length) await fetch(`${STORAGE}/object/videos`, { method: 'DELETE', headers: { ...SERVICE_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
}

// --- ffmpeg del transcodificador ---

function compose(args: string[]): void {
  execFileSync('docker', ['compose', ...args], { cwd: REPO_ROOT, stdio: 'ignore' });
}
// Genera un MP4 con ffmpeg (patrón de prueba + tono) dentro del contenedor y lo trae al host.
function generate(name: string, seconds: number, size: string, extra: string[] = []): string {
  const file = `real_${process.pid}_${name}.mp4`;
  compose(['exec', '-T', 'transcodificador', 'ffmpeg', '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${seconds > 600 ? 1 : 25}`, '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...extra, '-c:a', 'aac', '-shortest', `/trabajo/${file}`]);
  const local = join(TEMP, `${name}.mp4`);
  compose(['cp', `transcodificador:/trabajo/${file}`, local]);
  compose(['exec', '-T', 'transcodificador', 'rm', '-f', `/trabajo/${file}`]);
  return local;
}
// Alto del video de un TS (descifrado) medido con el ffprobe del contenedor; `null` si no es un TS válido.
function probeHeight(content: Buffer): number | null {
  const name = `sonda_${process.pid}_${randomBytes(4).toString('hex')}.ts`;
  const local = join(TEMP, name);
  writeFileSync(local, content);
  compose(['cp', local, `transcodificador:/trabajo/${name}`]);
  try {
    const out = execFileSync('docker', ['compose', 'exec', '-T', 'transcodificador', 'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', `/trabajo/${name}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const height = Number(out.split('\n')[0].trim());
    return Number.isInteger(height) && height > 0 ? height : null;
  } catch {
    return null;
  } finally {
    compose(['exec', '-T', 'transcodificador', 'rm', '-f', `/trabajo/${name}`]);
  }
}

// --- Curso de prueba ---

interface Lesson {
  courseId: number;
  sectionId: number;
  lessonId: number;
}
let instructor: Account;
async function newLesson(title: string): Promise<Lesson> {
  const course = await op('crear_curso', { titulo: `ZZ Real ${process.pid} ${title}` }, instructor.token);
  const courseId = Number((course.data as { crear_curso: { id: number } }).crear_curso.id);
  courses.push(courseId);
  const section = await op('guardar_seccion', { curso_id: courseId, titulo: 'Sección' }, instructor.token);
  const sectionId = Number((section.data as { guardar_seccion: { id: number } }).guardar_seccion.id);
  const lesson = await op('guardar_clase', { seccion_id: sectionId, titulo: 'Clase', es_muestra: false }, instructor.token);
  return { courseId, sectionId, lessonId: Number((lesson.data as { guardar_clase: { id: number } }).guardar_clase.id) };
}

interface Uploaded {
  videoId: number;
  path: string;
  base: string;
}
// Firma por REST, sube el archivo con la URL firmada y confirma la subida con la mutación.
async function upload(lesson: Lesson, file: string, confirm = true): Promise<Uploaded> {
  const bytes = readFileSync(file);
  const response = await sign(instructor.token, { clase_id: lesson.lessonId, nombre_archivo: 'clase.mp4', tipo_contenido: 'video/mp4', tamano_bytes: bytes.length });
  expect(response.status).toBe(201);
  const put = await fetch(`${STORAGE}${(response.body.url_subida as string).replace(/^\/almacen/, '')}`, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array(bytes) });
  expect(put.status).toBe(200);
  const videoId = response.body.video_id as number;
  keys.add(sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${videoId}`));
  const path = response.body.ruta as string;
  if (confirm) {
    const confirmed = await op('confirmar_subida_video', { video_id: videoId }, instructor.token);
    expect(confirmed.errors).toBeUndefined();
    expect(confirmed.data).toEqual({ confirmar_subida_video: { estado: 'en_cola' } });
  }
  return { videoId, path, base: path.replace('/original.mp4', '') };
}

interface State {
  vigente: { id: number; estado: string; duracion_segundos: number; listo_en: string | null } | null;
  nuevo: { id: number; estado: string; error: string | null } | null;
}
const state = async (lesson: Lesson): Promise<State> => ((await op('estado_video', { clase_id: lesson.lessonId }, instructor.token)).data as { estado_video: State }).estado_video;
async function waitFor(lesson: Lesson, condition: (s: State) => boolean, ms = MAX_WAIT_MS): Promise<State> {
  const limit = Date.now() + ms;
  let last = await state(lesson);
  while (!condition(last)) {
    if (Date.now() > limit) throw new Error(`Tiempo agotado esperando el estado del video: ${JSON.stringify(last)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    last = await state(lesson);
  }
  return last;
}

// Lista HLS: declara AES-128 con su IV; devuelve el IV y los nombres de los segmentos.
async function readPlaylist(base: string): Promise<{ text: string; iv: Buffer; segments: string[] }> {
  const buffer = await getObject(`${base}/hls/lista.m3u8`);
  expect(buffer).not.toBeNull();
  const text = buffer!.toString('utf8');
  expect(text).toContain('METHOD=AES-128');
  const iv = /IV=0x([0-9a-f]{32})/i.exec(text)?.[1];
  expect(iv).toBeDefined();
  return { text, iv: Buffer.from(iv!, 'hex'), segments: text.split('\n').filter((l) => /^segmento_\d+\.ts$/.test(l.trim())).map((l) => l.trim()) };
}
const isTransportStream = (data: Buffer): boolean => data.length >= 564 && [0, 188, 376].every((i) => data[i] === 0x47);

beforeAll(async () => {
  cleanup();
  sql(`delete from escuela.cursos where titulo like 'ZZ Real %'`);
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
});
afterAll(async () => {
  for (const id of courses) await deletePrefix(`cursos/${id}`);
  sql(`delete from escuela.cursos where titulo like 'ZZ Real %'`);
  removeAccountResidue(userIds);
  cleanup();
  for (const id of courses) expect(await filesUnder(`cursos/${id}`)).toEqual([]); // no quedó ningún objeto
});

describe('video real contra el contenedor de producción', () => {
  it('un MP4 de 360p queda listo en menos de 2 minutos: duración real, AES-128, sin original y segmento cifrado que se descifra con la clave', async () => {
    const lesson = await newLesson('360p');
    const file = generate('v360', 4, '640x360');
    const started = Date.now();
    const video = await upload(lesson, file);
    const done = await waitFor(lesson, (s) => s.vigente?.estado === 'listo');
    expect(Date.now() - started).toBeLessThan(MAX_WAIT_MS);
    expect(done.nuevo).toBeNull();
    expect(done.vigente).toMatchObject({ id: video.videoId, estado: 'listo' });
    expect(Math.abs(done.vigente!.duracion_segundos - 4)).toBeLessThanOrEqual(1);
    expect(done.vigente!.listo_en).not.toBeNull();

    const playlist = await readPlaylist(video.base);
    expect(playlist.segments.length).toBeGreaterThan(0);
    expect(playlist.text).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x/); // la clave nunca va en la lista
    expect(await exists(`${video.base}/original.mp4`)).toBe(false); // el original se borró
    expect(await filesUnder(video.base)).not.toContainEqual(expect.stringMatching(/original\./));
    expect((await fetch(`${STORAGE}/object/public/videos/${video.base}/hls/lista.m3u8`)).status).not.toBe(200); // bucket privado

    const segment = (await getObject(`${video.base}/hls/${playlist.segments[0]}`))!;
    expect(isTransportStream(segment)).toBe(false); // cifrado: no es un TS
    expect(probeHeight(segment)).toBeNull();
    const keyHex = sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${video.videoId}`);
    const decipher = createDecipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), playlist.iv);
    const clear = Buffer.concat([decipher.update(segment), decipher.final()]);
    expect(isTransportStream(clear)).toBe(true); // descifrado con la clave de claves_video y el IV de la lista
    expect(probeHeight(clear)).toBe(360); // 360p se queda en 360
    const wrong = createDecipheriv('aes-128-cbc', randomBytes(16), playlist.iv);
    expect(isTransportStream(wrong.update(segment))).toBe(false); // con otra clave no sale un TS
  });

  it('un video de 1080p se reduce a 720 de alto', async () => {
    const lesson = await newLesson('1080p');
    const video = await upload(lesson, generate('v1080', 4, '1920x1080', ['-crf', '35']));
    await waitFor(lesson, (s) => s.vigente?.id === video.videoId && s.vigente.estado === 'listo');
    const playlist = await readPlaylist(video.base);
    const keyHex = sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${video.videoId}`);
    const segment = (await getObject(`${video.base}/hls/${playlist.segments[0]}`))!;
    const decipher = createDecipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), playlist.iv);
    const clear = Buffer.concat([decipher.update(segment), decipher.final()]);
    expect(probeHeight(clear)).toBe(720);
  });

  it('un archivo corrupto termina en error con el original conservado; reintentar_video lo devuelve a en_cola y vuelve a error', async () => {
    const lesson = await newLesson('corrupto');
    const garbage = join(TEMP, 'basura.mp4');
    writeFileSync(garbage, randomBytes(50_000));
    const video = await upload(lesson, garbage);
    const failed = await waitFor(lesson, (s) => s.nuevo?.estado === 'error');
    expect(failed.vigente).toBeNull();
    expect(failed.nuevo!.error).toContain('dañado');
    expect(await exists(video.path)).toBe(true); // el original se conserva para reintentar

    const retried = await op('reintentar_video', { video_id: video.videoId }, instructor.token);
    expect(retried.data).toEqual({ reintentar_video: { estado: 'en_cola' } });
    const again = await waitFor(lesson, (s) => s.nuevo?.estado === 'error' && !!s.nuevo.error?.includes('dañado'));
    expect(again.nuevo!.id).toBe(video.videoId);
    expect(await exists(video.path)).toBe(true);
  });

  it('un video de 31 minutos termina en error: "dura más de 30 minutos"', async () => {
    const lesson = await newLesson('31 minutos');
    const video = await upload(lesson, generate('v31', 31 * 60, '64x64'));
    const failed = await waitFor(lesson, (s) => s.nuevo?.estado === 'error');
    expect(failed.nuevo!.error).toContain('dura más de 30 minutos');
    expect(await exists(video.path)).toBe(true);
  });

  it('reemplazo: el anterior sigue vigente hasta que el nuevo está listo y entonces sus archivos desaparecen', async () => {
    const lesson = await newLesson('reemplazo');
    const first = await upload(lesson, generate('r1', 4, '640x360'));
    await waitFor(lesson, (s) => s.vigente?.id === first.videoId && s.vigente.estado === 'listo');
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(true);

    const second = await upload(lesson, generate('r2', 60, '1280x720', ['-crf', '32']));
    const during = await state(lesson); // el nuevo apenas se encoló: el anterior sigue siendo el vigente
    expect(during.vigente).toMatchObject({ id: first.videoId, estado: 'listo' });
    expect(during.nuevo).toMatchObject({ id: second.videoId });
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(true);

    const swapped = await waitFor(lesson, (s) => s.vigente?.id === second.videoId && s.nuevo === null);
    expect(swapped.vigente!.estado).toBe('listo');
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${lesson.lessonId} and vigente`)).toBe('1');
    expect(sql(`select count(*) from escuela.videos_clase where id = ${first.videoId}`)).toBe('0'); // la fila anterior (y su clave) se borró
    expect(sql(`select count(*) from escuela.claves_video where video_id = ${first.videoId}`)).toBe('0');
    expect(await exists(`${first.base}/hls/lista.m3u8`)).toBe(false);
    expect(await filesUnder(first.base)).toEqual([]);
    expect(await exists(`${second.base}/hls/lista.m3u8`)).toBe(true);
  });

  it('borrar_video, borrar_clase y borrar_seccion borran filas y archivos de videos reales', async () => {
    const lesson = await newLesson('borrado');
    const file = generate('b1', 3, '320x180');
    const one = await upload(lesson, file);
    await waitFor(lesson, (s) => s.vigente?.id === one.videoId && s.vigente.estado === 'listo');
    expect(await exists(`${one.base}/hls/lista.m3u8`)).toBe(true);
    expect((await op('borrar_video', { clase_id: lesson.lessonId }, instructor.token)).data).toEqual({ borrar_video: { ok: true } });
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${lesson.lessonId}`)).toBe('0');
    expect(sql(`select count(*) from escuela.claves_video where video_id = ${one.videoId}`)).toBe('0');
    expect(await filesUnder(one.base)).toEqual([]);
    expect((await state(lesson))).toEqual({ vigente: null, nuevo: null });

    const two = await upload(lesson, file);
    await waitFor(lesson, (s) => s.vigente?.id === two.videoId && s.vigente.estado === 'listo');
    expect((await op('borrar_clase', { clase_id: lesson.lessonId }, instructor.token)).data).toEqual({ borrar_clase: { ok: true } });
    expect(sql(`select count(*) from escuela.videos_clase where id = ${two.videoId}`)).toBe('0');
    expect(await filesUnder(two.base)).toEqual([]);

    const lesson2 = await op('guardar_clase', { seccion_id: lesson.sectionId, titulo: 'Otra', es_muestra: false }, instructor.token);
    const lessonId2 = Number((lesson2.data as { guardar_clase: { id: number } }).guardar_clase.id);
    const three = await upload({ ...lesson, lessonId: lessonId2 }, file);
    await waitFor({ ...lesson, lessonId: lessonId2 }, (s) => s.vigente?.id === three.videoId && s.vigente.estado === 'listo');
    expect((await op('borrar_seccion', { seccion_id: lesson.sectionId }, instructor.token)).data).toEqual({ borrar_seccion: { ok: true } });
    expect(sql(`select count(*) from escuela.videos_clase where id = ${three.videoId}`)).toBe('0');
    expect(await filesUnder(three.base)).toEqual([]);
  });

  it('el aviso del transcodificador llega directo a la API: sin la cabecera secreta da 403', async () => {
    const r = await http().post('/api/v1/interno/video-procesado').set('X-Forwarded-For', newIp()).send({ video_id: 1, resultado: 'error' });
    expect(r.status).toBe(403);
    expect((await http().post('/escuela/interno/video-procesado').set('X-Forwarded-For', newIp()).send({ video_id: 1, resultado: 'error' })).status).toBe(404);
  });

  it('ninguna respuesta de la API contiene la clave de cifrado ni clave_hex', () => {
    expect(keys.size).toBeGreaterThan(0);
    const everything = seen.join('\n');
    expect(everything).not.toContain('clave_hex');
    for (const key of keys) expect(everything.toLowerCase()).not.toContain(key.toLowerCase());
  });
});
