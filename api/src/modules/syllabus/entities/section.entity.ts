import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'secciones' })
export class Section {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'curso_id', type: 'bigint' })
  courseId: string;

  @Column({ name: 'titulo', type: 'text' })
  title: string;

  @Column({ name: 'posicion', type: 'smallint' })
  position: number;
}
