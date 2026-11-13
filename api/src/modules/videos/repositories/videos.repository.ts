import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { STALE_MESSAGE, STALE_MINUTES, SERVICE_ERROR_MESSAGE, VideoStatus } from '../utils/video-rules';

export interface NewVideoRecord {
  id: number;
  lessonId: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  basePath: string;
  key: Buffer;
}

export interface QueueCandidate {
  id: number;
  status: VideoStatus;
  contentType: string;
  sizeBytes: number;
  basePath: string;
  // Clave AES-128 en hexadecimal: solo viaja al transcodificador; nunca a una respuesta ni al registro.
  keyHex: string;
}

export interface StatusRow {
  id: number;
  status: VideoStatus;
  isCurrent: boolean;
  durationSeconds: number | null;
  readyAt: Date | null;
  error: string | null;
}

export interface AppliedResult {
  applied: boolean;
  basePath: string | null;
  contentType: string | null;
  previousBasePaths: string[];
}

type Row = Record<string, unknown>;

// Toda la SQL de los videos (workflows de la SPEC 08). Las transiciones de estado van en una sola sentencia, condicionadas al
// estado de origen, para que reintentos y carreras no pisen un estado posterior. `claves_video` solo se toca aquí.
@Injectable()
export class VideosRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Reserva el id del video y devuelve la carpeta de su clase con los ids reales; `null` si la clase no existe.
  async reserve(lessonId: number): Promise<{ id: number; lessonFolder: string } | null> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT nextval(pg_get_serial_sequence('escuela.videos_clase', 'id'))::bigint AS id,
              'cursos/' || s.curso_id || '/secciones/' || s.id || '/clases/' || k.id AS carpeta_clase
       FROM escuela.clases k JOIN escuela.secciones s ON s.id = k.seccion_id WHERE k.id = $1::bigint`,
      [lessonId],
    );
    return rows[0] ? { id: Number(rows[0].id), lessonFolder: String(rows[0].carpeta_clase) } : null;
  }

  // Inserta el video y su clave. `false` si la clase ya tiene un video en proceso (índice único parcial).
  async register(video: NewVideoRecord): Promise<boolean> {
    const rows = await this.dataSource.query<Row[]>(
      `WITH nuevo AS (
         INSERT INTO escuela.videos_clase (id, clase_id, estado, nombre_original, tipo_contenido, tamano_bytes, ruta_base)
         VALUES ($1::bigint, $2::bigint, 'esperando_archivo', $3::text, $4::text, $5::bigint, $6::text)
         ON CONFLICT DO NOTHING RETURNING id
       ), clave AS (
         INSERT INTO escuela.claves_video (video_id, clave) SELECT id, $7::bytea FROM nuevo RETURNING video_id
       )
       SELECT EXISTS (SELECT 1 FROM nuevo) AS registrado`,
      [video.id, video.lessonId, video.originalName, video.contentType, video.sizeBytes, video.basePath, video.key],
    );
    return rows[0].registrado === true;
  }

  async findForQueue(videoId: number): Promise<QueueCandidate | null> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT v.id, v.estado, v.tipo_contenido, v.tamano_bytes, v.ruta_base, encode(k.clave, 'hex') AS clave_hex
       FROM escuela.videos_clase v JOIN escuela.claves_video k ON k.video_id = v.id WHERE v.id = $1::bigint`,
      [videoId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      status: row.estado as VideoStatus,
      contentType: String(row.tipo_contenido),
      sizeBytes: Number(row.tamano_bytes),
      basePath: String(row.ruta_base),
      keyHex: String(row.clave_hex),
    };
  }

  // `en_cola` solo si el video sigue en el estado requerido (así dos confirmaciones a la vez no lo encolan dos veces).
  async markQueued(videoId: number, requiredStatus: VideoStatus): Promise<boolean> {
    const rows = await this.dataSource.query<Row[]>(
      `WITH x AS (UPDATE escuela.videos_clase SET estado = 'en_cola', error = NULL, actualizado_en = now()
                  WHERE id = $1::bigint AND estado = $2::text RETURNING id)
       SELECT count(*)::int AS n FROM x`,
      [videoId, requiredStatus],
    );
    return Number(rows[0].n) === 1;
  }

  // El transcodificador no aceptó el trabajo: el video queda en `error` (y se puede reintentar).
  async markServiceError(videoId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE escuela.videos_clase SET estado = 'error', error = $2::text, actualizado_en = now() WHERE id = $1::bigint AND estado = 'en_cola'`,
      [videoId, SERVICE_ERROR_MESSAGE],
    );
  }

  // Cierra como `error` los videos de la clase que llevan más de 45 minutos sin cambios.
  async expireStale(lessonId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE escuela.videos_clase SET estado = 'error', error = $2::text, actualizado_en = now()
       WHERE clase_id = $1::bigint AND estado IN ('en_cola', 'procesando') AND actualizado_en < now() - make_interval(mins => $3::int)`,
      [lessonId, STALE_MESSAGE, STALE_MINUTES],
    );
  }

  // El vigente y el último no vigente (el que se está subiendo, procesando o con error).
  async statusOf(lessonId: number): Promise<StatusRow[]> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT v.id, v.estado, v.vigente, v.duracion_segundos, v.listo_en, v.error
       FROM escuela.videos_clase v
       WHERE v.clase_id = $1::bigint
         AND (v.vigente OR v.id = (SELECT max(n.id) FROM escuela.videos_clase n WHERE n.clase_id = $1::bigint AND NOT n.vigente))`,
      [lessonId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      status: row.estado as VideoStatus,
      isCurrent: row.vigente === true,
      durationSeconds: row.duracion_segundos === null ? null : Number(row.duracion_segundos),
      readyAt: row.listo_en instanceof Date ? row.listo_en : null,
      error: row.error === null ? null : String(row.error),
    }));
  }

  // Borra todos los videos de la clase (la clave cae en cascada) y devuelve sus rutas base.
  async deleteByLesson(lessonId: number): Promise<string[]> {
    const rows = await this.dataSource.query<Row[]>(
      `WITH borrados AS (DELETE FROM escuela.videos_clase WHERE clase_id = $1::bigint RETURNING ruta_base)
       SELECT coalesce(array_agg(ruta_base), '{}') AS rutas_base FROM borrados`,
      [lessonId],
    );
    return rows[0].rutas_base as string[];
  }

  // Resultado del transcodificador, en UNA sola sentencia: solo si el video sigue `en_cola` o `procesando`. Con `listo`, el
  // anterior vigente de la clase se borra (la subconsulta sobre `anterior` obliga a hacerlo antes, por el índice único de
  // `vigente`) y el nuevo pasa a vigente. Un reintento del aviso, o un video ya borrado, no aplica nada (`applied = false`).
  async applyResult(videoId: number, result: 'listo' | 'error', durationSeconds: number | null, message: string | null): Promise<AppliedResult> {
    const rows = await this.dataSource.query<Row[]>(
      `WITH objetivo AS (
         SELECT id, clase_id FROM escuela.videos_clase WHERE id = $1::bigint AND estado IN ('en_cola', 'procesando')
       ), anterior AS (
         DELETE FROM escuela.videos_clase v
         WHERE $2::text = 'listo' AND v.vigente AND v.id <> $1::bigint AND v.clase_id = (SELECT clase_id FROM objetivo)
         RETURNING v.ruta_base
       ), nuevo AS (
         UPDATE escuela.videos_clase v SET
           estado = CASE WHEN $2::text = 'listo' THEN 'listo' ELSE 'error' END,
           vigente = ($2::text = 'listo'),
           duracion_segundos = CASE WHEN $2::text = 'listo' THEN $3::int END,
           listo_en = CASE WHEN $2::text = 'listo' THEN now() END,
           error = CASE WHEN $2::text = 'listo' THEN NULL ELSE coalesce($4::text, 'El video no se pudo procesar.') END,
           actualizado_en = now()
         WHERE v.id = $1::bigint AND v.estado IN ('en_cola', 'procesando') AND (SELECT count(*) FROM anterior) >= 0
         RETURNING v.ruta_base, v.tipo_contenido
       )
       SELECT EXISTS (SELECT 1 FROM nuevo) AS aplicado,
              (SELECT ruta_base FROM nuevo) AS ruta_base,
              (SELECT tipo_contenido FROM nuevo) AS tipo_contenido,
              coalesce((SELECT array_agg(ruta_base) FROM anterior), '{}') AS anteriores`,
      [videoId, result, durationSeconds, message],
    );
    const row = rows[0];
    return {
      applied: row.aplicado === true,
      basePath: row.ruta_base === null ? null : String(row.ruta_base),
      contentType: row.tipo_contenido === null ? null : String(row.tipo_contenido),
      previousBasePaths: row.anteriores as string[],
    };
  }
}
