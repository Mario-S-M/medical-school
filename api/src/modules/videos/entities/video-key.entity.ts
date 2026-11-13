import { Column, Entity, PrimaryColumn } from 'typeorm';

// Clave AES-128 del video. Nunca se expone por la API (ni GraphQL, ni REST, ni errores).
@Entity({ schema: 'escuela', name: 'claves_video' })
export class VideoKey {
  @PrimaryColumn({ name: 'video_id', type: 'bigint' })
  videoId: string;

  @Column({ name: 'clave', type: 'bytea', select: false })
  key: Buffer;
}
