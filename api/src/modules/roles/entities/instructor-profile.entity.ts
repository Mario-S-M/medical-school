import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'perfiles_instructor' })
export class InstructorProfile {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'nombre_publico', type: 'text' })
  publicName: string;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
