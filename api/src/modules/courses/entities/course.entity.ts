import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'cursos' })
export class Course {
  // bigint llega como string desde pg
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'slug', type: 'text' })
  slug: string;

  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId: string;

  @Column({ name: 'titulo', type: 'text' })
  title: string;

  @Column({ name: 'subtitulo', type: 'text', nullable: true })
  subtitle: string | null;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'conocimientos_previos', type: 'text', nullable: true })
  prerequisites: string | null;

  @Column({ name: 'lo_que_aprenderas', type: 'text', array: true, default: () => "'{}'" })
  learningOutcomes: string[];

  @Column({ name: 'nivel', type: 'text', nullable: true })
  level: 'basico' | 'intermedio' | 'avanzado' | null;

  @Column({ name: 'categoria_id', type: 'smallint', nullable: true })
  categoryId: number | null;

  @Column({ name: 'estado', type: 'text', default: 'borrador' })
  status: 'borrador' | 'en_revision' | 'publicado';

  @Column({ name: 'comentario_revision', type: 'text', nullable: true })
  reviewComment: string | null;

  @Column({ name: 'portada_ruta', type: 'text', nullable: true })
  coverPath: string | null;

  @Column({ name: 'publicado_en', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  // Columna generada (tsvector de título, subtítulo y descripción sin acentos): solo se usa en consultas de búsqueda.
  @Column({ name: 'busqueda', type: 'tsvector', insert: false, update: false, select: false })
  search: string;
}
