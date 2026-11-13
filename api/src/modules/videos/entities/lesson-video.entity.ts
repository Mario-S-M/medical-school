import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'videos_clase' })
export class LessonVideo {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'clase_id', type: 'bigint' })
  lessonId: string;

  @Column({ name: 'estado', type: 'text' })
  status: 'esperando_archivo' | 'en_cola' | 'procesando' | 'listo' | 'error';

  @Column({ name: 'vigente', type: 'boolean', default: false })
  isCurrent: boolean;

  @Column({ name: 'nombre_original', type: 'text' })
  originalName: string;

  @Column({ name: 'tipo_contenido', type: 'text' })
  contentType: 'video/mp4' | 'video/quicktime' | 'video/webm';

  @Column({ name: 'tamano_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'duracion_segundos', type: 'integer', nullable: true })
  durationSeconds: number | null;

  @Column({ name: 'ruta_base', type: 'text' })
  basePath: string;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @Column({ name: 'listo_en', type: 'timestamptz', nullable: true })
  readyAt: Date | null;
}
