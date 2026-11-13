import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'roles_usuario' })
export class UserRole {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'rol', type: 'text' })
  role: 'instructor' | 'equipo_apoyo' | 'administrador';

  @Column({ name: 'asignado_por', type: 'uuid', nullable: true })
  assignedBy: string | null;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
