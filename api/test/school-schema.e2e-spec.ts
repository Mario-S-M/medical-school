import { sql } from './helpers/real-env';

// SPEC 10, paso 10: restricciones de la base de los videos (SPEC 08) que antes comprobaba `pruebas.sh` con SQL directo.
// Se ejecutan contra `plataforma.escuela` con un curso propio que se borra al final (la cascada también se comprueba).

const TAG = `${process.pid}`;
let courseId = 0;
let lessonId = 0;

function attempt(query: string): string {
  try {
    return sql(query);
  } catch (error) {
    const e = error as { stderr?: string; message: string };
    return `ERROR ${e.stderr ?? ''} ${e.message}`;
  }
}
const insertVideo = (status: string, current: boolean, type = 'video/mp4', size = 10): string =>
  attempt(`insert into escuela.videos_clase (clase_id, estado, vigente, nombre_original, tipo_contenido, tamano_bytes, ruta_base) values (${lessonId}, '${status}', ${current}, 'a.mp4', '${type}', ${size}, 'x') returning id`);

beforeAll(() => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-schema-%'`);
  const instructor = '00000000-0000-4000-8000-0000000000aa';
  courseId = Number(sql(`insert into escuela.cursos (slug, instructor_id, titulo) values ('zz-e2e-schema-${TAG}', '${instructor}', 'ZZ esquema') returning id`));
  const section = Number(sql(`insert into escuela.secciones (curso_id, titulo, posicion) values (${courseId}, 'S', 1) returning id`));
  lessonId = Number(sql(`insert into escuela.clases (seccion_id, titulo, posicion) values (${section}, 'C', 1) returning id`));
});
afterAll(() => {
  sql(`delete from escuela.cursos where slug like 'zz-e2e-schema-%'`);
});

describe('restricciones de videos_clase y claves_video', () => {
  it('un solo video vigente y uno solo en proceso por clase; varios en error conviven', () => {
    expect(insertVideo('listo', true)).toMatch(/^\d+$/);
    expect(insertVideo('listo', true)).toContain('videos_vigente_unico');
    expect(insertVideo('en_cola', false)).toMatch(/^\d+$/);
    expect(insertVideo('procesando', false)).toContain('videos_en_proceso_unico');
    expect(insertVideo('error', false)).toMatch(/^\d+$/);
    expect(insertVideo('error', false)).toMatch(/^\d+$/);
  });

  it('solo MP4, MOV y WebM, y hasta 1 073 741 824 bytes', () => {
    expect(insertVideo('error', false, 'video/avi')).toContain('tipo_contenido_check');
    expect(insertVideo('error', false, 'video/mp4', 1073741825)).toContain('tamano_bytes_check');
    expect(insertVideo('error', false, 'video/quicktime', 1073741824)).toMatch(/^\d+$/);
  });

  it('la clave es de 16 bytes y borrar el curso borra en cascada sus videos y sus claves', () => {
    const videoId = Number(sql(`select id from escuela.videos_clase where clase_id = ${lessonId} and estado = 'en_cola'`));
    expect(attempt(`insert into escuela.claves_video values (${videoId}, decode('00112233445566778899aabbccddeeff', 'hex')) returning video_id`)).toBe(String(videoId));
    const other = Number(sql(`select id from escuela.videos_clase where clase_id = ${lessonId} and estado = 'error' limit 1`));
    expect(attempt(`insert into escuela.claves_video values (${other}, decode('00112233445566778899aabbccddeeff00', 'hex'))`)).toContain('claves_video_clave_check');
    sql(`delete from escuela.cursos where id = ${courseId}`);
    expect(sql(`select count(*) from escuela.videos_clase where clase_id = ${lessonId}`)).toBe('0');
    expect(sql(`select count(*) from escuela.claves_video where video_id = ${videoId}`)).toBe('0');
  });
});
