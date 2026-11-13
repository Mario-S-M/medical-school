import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PlayableVideo {
  id: number;
  lessonId: number;
  basePath: string;
  durationSeconds: number | null;
}

type Row = Record<string, unknown>;

function toVideo(row: Row): PlayableVideo {
  return {
    id: Number(row.id),
    lessonId: Number(row.clase_id),
    basePath: String(row.ruta_base),
    durationSeconds: row.duracion_segundos === null ? null : Number(row.duracion_segundos),
  };
}

// SQL de la reproducción. Un video se puede reproducir solo si es el vigente de su clase y está `listo`.
// `readKey` es la única lectura de `claves_video.clave` fuera del flujo de la cola de videos y solo la usa `GET .../clave`.
@Injectable()
export class PlaybackRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // `null` si la clase no existe.
  async findLesson(lessonId: number): Promise<{ isSample: boolean } | null> {
    const rows = await this.dataSource.query<Row[]>('SELECT es_muestra FROM escuela.clases WHERE id = $1::bigint', [lessonId]);
    return rows[0] ? { isSample: rows[0].es_muestra === true } : null;
  }

  async findPlayableByLesson(lessonId: number): Promise<PlayableVideo | null> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT id, clase_id, ruta_base, duracion_segundos FROM escuela.videos_clase WHERE clase_id = $1::bigint AND vigente AND estado = 'listo'`,
      [lessonId],
    );
    return rows[0] ? toVideo(rows[0]) : null;
  }

  async findPlayable(videoId: number): Promise<PlayableVideo | null> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT id, clase_id, ruta_base, duracion_segundos FROM escuela.videos_clase WHERE id = $1::bigint AND vigente AND estado = 'listo'`,
      [videoId],
    );
    return rows[0] ? toVideo(rows[0]) : null;
  }

  // Los bytes de la clave AES-128 del video, o `null` si no hay.
  async readKey(videoId: number): Promise<Buffer | null> {
    const rows = await this.dataSource.query<Row[]>('SELECT clave FROM escuela.claves_video WHERE video_id = $1::bigint', [videoId]);
    return rows[0] && Buffer.isBuffer(rows[0].clave) ? rows[0].clave : null;
  }
}
