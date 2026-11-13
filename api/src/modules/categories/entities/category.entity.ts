import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'categorias' })
export class Category {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'smallint' })
  id: number;

  @Column({ name: 'nombre', type: 'text' })
  name: string;

  @Column({ name: 'slug', type: 'text' })
  slug: string;

  @Column({ name: 'posicion', type: 'smallint' })
  position: number;
}
