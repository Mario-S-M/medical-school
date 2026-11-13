import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'clases' })
export class Lesson {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'seccion_id', type: 'bigint' })
  sectionId: string;

  @Column({ name: 'titulo', type: 'text' })
  title: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'duracion_estimada_minutos', type: 'smallint', nullable: true })
  estimatedMinutes: number | null;

  @Column({ name: 'es_muestra', type: 'boolean', default: false })
  isSample: boolean;

  @Column({ name: 'posicion', type: 'smallint' })
  position: number;
}
