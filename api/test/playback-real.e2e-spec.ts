import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MANIFEST_PATH } from '../src/modules/graphql/persisted-queries';
import { Account, GqlBody, giveRole, newAccount, removeAccountResidue } from './helpers/school-gql';
import { cleanup, deleteTestEmails, http, newIp, sql } from './helpers/real-env';
import { deletePrefix, filesUnder, generateMp4, getObject, probe, STORAGE_URL } from './helpers/real-video';

// SPEC 12, paso 3: reproducción protegida de punta a punta contra el stack REAL, tal como corre en producción: contenedor `api`
// en 127.0.0.1:3000 (solo hashes persistidos; firmas de video por REST), Storage por Kong y el transcodificador real con ffmpeg.
// Se sube un MP4 real, se autoriza como estudiante, se pide la lista y la clave y se descifran los segmentos descargados por sus
// URL firmadas con la clave que entrega la API y el IV de la lista. La vida de la URL firmada está en `playback-lifetime`.

jest.setTimeout(300_000);

const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
const HASHES = new Map<string, string>();
for (const [hash, text] of Object.entries(MANIFEST)) {
  const name = /^(?:query|mutation)\s+(\w+)/.exec(text)?.[1];
  if (name) HASHES.set(name, hash);
}
const MAX_WAIT_MS = 120_000;
const SECONDS = 8;

const userIds: string[] = [];
const courses: number[] = [];
let instructor: Account;
let student: Account;

async function op(name: string, variables: Record<string, unknown>, token: string): Promise<GqlBody> {
  const documentId = HASHES.get(name);
  if (!documentId) throw new Error(`La operación ${name} no está en el manifiesto`);
  const r = await http().post('/api/graphql').set('X-Forwarded-For', newIp()).set('Authorization', `Bearer ${token}`).send({ documentId, variables });
  expect(r.status).toBe(200);
  return r.body as GqlBody;
}
const field = <T>(body: GqlBody, name: string): T => {
  expect(body.errors).toBeUndefined();
  return (body.data as Record<string, T>)[name];
};

interface Ready {
  lessonId: number;
  videoId: number;
  base: string;
  keyHex: string;
}
interface State {
  vigente: { id: number; estado: string; duracion_segundos: number } | null;
  nuevo: { estado: string; error: string | null } | null;
}
async function waitReady(lessonId: number): Promise<State> {
  const limit = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const s = field<State>(await op('estado_video', { clase_id: lessonId }, instructor.token), 'estado_video');
    if (s.vigente?.estado === 'listo') return s;
    if (s.nuevo?.estado === 'error') throw new Error(`El video terminó en error: ${s.nuevo.error}`);
    if (Date.now() > limit) throw new Error(`Tiempo agotado esperando el video: ${JSON.stringify(s)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Curso publicado por SQL con una clase y un MP4 real subido por URL firmada, confirmado y esperado hasta `listo`.
async function newReadyLesson(sample: boolean, courseId?: number, sectionId?: number): Promise<Ready & { courseId: number; sectionId: number }> {
  if (courseId === undefined) {
    courseId = Number(field<{ id: number }>(await op('crear_curso', { titulo: `ZZ Real Rep ${process.pid}` }, instructor.token), 'crear_curso').id);
    courses.push(courseId);
    sectionId = Number(field<{ id: number }>(await op('guardar_seccion', { curso_id: courseId, titulo: 'Sección' }, instructor.token), 'guardar_seccion').id);
  }
  const lessonId = Number(field<{ id: number }>(await op('guardar_clase', { seccion_id: sectionId, titulo: sample ? 'Muestra' : 'Normal', es_muestra: sample }, instructor.token), 'guardar_clase').id);
  const bytes = readFileSync(generateMp4(sample ? 'muestra' : 'normal', SECONDS));
  const sign = await http().post('/api/v1/videos/firmas').set('X-Forwarded-For', newIp()).set('Authorization', `Bearer ${instructor.token}`)
    .send({ clase_id: lessonId, nombre_archivo: 'clase.mp4', tipo_contenido: 'video/mp4', tamano_bytes: bytes.length });
  expect(sign.status).toBe(201);
  const put = await fetch(`${STORAGE_URL}${(sign.body.url_subida as string).replace(/^\/almacen/, '')}`, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array(bytes) });
  expect(put.status).toBe(200);
  const videoId = sign.body.video_id as number;
  const confirmed = await op('confirmar_subida_video', { video_id: videoId }, instructor.token);
  expect(confirmed.data).toEqual({ confirmar_subida_video: { estado: 'en_cola' } });
  const done = await waitReady(lessonId);
  expect(done.vigente!.id).toBe(videoId);
  return {
    lessonId,
    videoId,
    courseId,
    sectionId: sectionId!,
    base: (sign.body.ruta as string).replace('/original.mp4', ''),
    keyHex: sql(`select encode(clave, 'hex') from escuela.claves_video where video_id = ${videoId}`),
  };
}

const authorize = async (account: Account, lessonId: number): Promise<GqlBody> => op('autorizar_reproduccion', { clase_id: lessonId }, account.token);
const get = (path: string, token?: string) => {
  const r = http().get(path).set('X-Forwarded-For', newIp()).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};
// Los segmentos salen de Storage por Kong: el prefijo `/almacen` solo existe en el proxy de Astro.
const storageUrl = (signed: string): string => `${STORAGE_URL}${signed.replace(/^\/almacen/, '')}`;

let sample: Awaited<ReturnType<typeof newReadyLesson>>;
let normal: Awaited<ReturnType<typeof newReadyLesson>>;
let auth: { video_id: number; token: string; expira_en: number; lista_url: string; duracion_segundos: number; marca_agua: string };
let playlist: string;
let segmentUrls: string[];
let key: Buffer;

beforeAll(async () => {
  cleanup();
  sql(`delete from escuela.cursos where titulo like 'ZZ Real Rep %'`);
  instructor = await newAccount(userIds);
  giveRole(instructor.id, 'instructor');
  student = await newAccount(userIds);
  sample = await newReadyLesson(true);
  normal = await newReadyLesson(false, sample.courseId, sample.sectionId);
  sql(`update escuela.cursos set estado = 'publicado' where id = ${sample.courseId}`);
});
afterAll(async () => {
  try {
    for (const id of courses) await deletePrefix(`cursos/${id}`);
    sql(`delete from escuela.cursos where titulo like 'ZZ Real Rep %'`);
    removeAccountResidue(userIds);
    cleanup();
    await deleteTestEmails();
    for (const id of courses) expect(await filesUnder(`cursos/${id}`)).toEqual([]);
  } finally {
    /* la limpieza ya corrió */
  }
});

describe('reproducción protegida con un video real (contenedor de producción)', () => {
  it('autorizar_reproduccion (por hash) devuelve token, lista_url, duración real, marca de agua y 600 s', async () => {
    auth = field(await authorize(student, sample.lessonId), 'autorizar_reproduccion');
    expect(auth.video_id).toBe(sample.videoId);
    expect(auth.token.split('.')).toHaveLength(3);
    expect(auth.lista_url).toBe(`/api/v1/reproducciones/${sample.videoId}/lista.m3u8`);
    expect(Math.abs(auth.duracion_segundos - SECONDS)).toBeLessThanOrEqual(1);
    expect(auth.marca_agua).toBe(student.person.correo);
    expect(Math.abs(auth.expira_en - 600)).toBeLessThanOrEqual(2);
  });

  it('la lista REAL del transcodificador pasa el analizador estricto: AES-128 con su IV y cada segmento como URL firmada', async () => {
    const r = await get(auth.lista_url, auth.token);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(r.headers['cache-control']).toBe('no-store');
    playlist = (r.body as Buffer).toString('utf8');
    expect(playlist).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="clave",IV=0x[0-9a-f]{32}/i);
    expect(playlist).not.toMatch(/^segmento_\d+\.ts$/m); // ningún segmento sin firmar
    segmentUrls = playlist.split('\n').filter((l) => !l.startsWith('#') && l !== '');
    expect(segmentUrls.length).toBeGreaterThan(0);
    for (const url of segmentUrls) expect(url).toMatch(/^\/almacen\/object\/sign\/videos\/.+\/hls\/segmento_\d{5}\.ts\?token=/);
    const original = (await getObject(`${sample.base}/hls/lista.m3u8`))!.toString('utf8');
    expect(original.split('\n').filter((l) => l.startsWith('#'))).toEqual(playlist.split('\n').filter((l) => l.startsWith('#'))); // etiquetas intactas
  });

  it('GET clave devuelve los 16 bytes de claves_video; sin token no devuelve nada', async () => {
    const r = await get(`/api/v1/reproducciones/${sample.videoId}/clave`, auth.token);
    expect(r.status).toBe(200);
    key = r.body as Buffer;
    expect(key).toHaveLength(16);
    expect(key.toString('hex')).toBe(sample.keyHex);
    const none = await get(`/api/v1/reproducciones/${sample.videoId}/clave`);
    expect(none.status).toBe(401);
    expect((none.body as Buffer).toString('hex')).not.toContain(sample.keyHex);
  });

  it('los segmentos bajados por sus URL firmadas se descifran con la clave de la API y el IV de la lista: TS válido H.264/AAC; sin descifrar no lo es', async () => {
    const iv = Buffer.from(/IV=0x([0-9a-f]{32})/i.exec(playlist)![1], 'hex');
    const clear: Buffer[] = [];
    let encryptedBytes = 0;
    for (const url of segmentUrls) {
      const response = await fetch(storageUrl(url));
      expect(response.status).toBe(200);
      const encrypted = Buffer.from(await response.arrayBuffer());
      encryptedBytes += encrypted.length;
      if (clear.length === 0) expect(probe(encrypted)).toBeNull(); // sin descifrar no es un TS
      const decipher = createDecipheriv('aes-128-cbc', key, iv);
      clear.push(Buffer.concat([decipher.update(encrypted), decipher.final()]));
    }
    const first = probe(clear[0])!;
    expect(first).not.toBeNull();
    expect(first.duration).toBeGreaterThan(0);
    expect(first.codecs).toEqual(expect.arrayContaining(['h264', 'aac']));
    const whole = probe(Buffer.concat(clear))!;
    expect(Math.abs(whole.duration - auth.duracion_segundos)).toBeLessThanOrEqual(1);
    expect(Math.abs(whole.duration - SECONDS)).toBeLessThanOrEqual(1);
    console.log(`Video real: ${whole.duration.toFixed(2)} s, ${segmentUrls.length} segmentos, ${encryptedBytes} bytes cifrados, códecs ${whole.codecs.join('/')}`);
  });

  it('el token de otro video da 403, el de acceso da 401 y una URL firmada con la ruta de OTRO video no devuelve bytes', async () => {
    const other = field<{ token: string; video_id: number }>(await authorize(instructor, normal.lessonId), 'autorizar_reproduccion');
    expect(other.video_id).toBe(normal.videoId);
    for (const file of ['lista.m3u8', 'clave']) {
      expect((await get(`/api/v1/reproducciones/${sample.videoId}/${file}`, other.token)).status).toBe(403);
      expect((await get(`/api/v1/reproducciones/${sample.videoId}/${file}`, student.token)).status).toBe(401);
    }
    const url = new URL(storageUrl(segmentUrls[0]));
    const foreign = `${url.origin}${url.pathname.replace(sample.base, normal.base)}${url.search}`;
    expect(foreign).not.toBe(url.toString());
    const response = await fetch(foreign);
    expect(response.status).not.toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).length).toBeLessThan(1000); // un mensaje de error, nunca el segmento
    expect((await fetch(url)).status).toBe(200); // la URL propia sigue sirviendo
  });

  it('el original ya no existe en Storage', async () => {
    expect(await getObject(`${sample.base}/original.mp4`)).toBeNull();
    expect(await filesUnder(sample.base)).not.toContainEqual(expect.stringMatching(/original\./));
  });

  it('una clase que no es muestra: el estudiante recibe SIN_PERMISO y ningún token; el dueño sí recibe token', async () => {
    const denied = await authorize(student, normal.lessonId);
    expect(denied.errors?.[0].extensions.codigo).toBe('SIN_PERMISO');
    expect(JSON.stringify(denied)).not.toContain('token');
    const owner = field<{ token: string }>(await authorize(instructor, normal.lessonId), 'autorizar_reproduccion');
    expect(owner.token.split('.')).toHaveLength(3);
    expect((await get(`/api/v1/reproducciones/${normal.videoId}/lista.m3u8`, owner.token)).status).toBe(200);
  });
});
