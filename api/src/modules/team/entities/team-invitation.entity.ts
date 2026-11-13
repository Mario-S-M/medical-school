import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'invitaciones_equipo' })
export class TeamInvitation {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id: string;

  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId: string;

  @Column({ name: 'miembro_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'correo', type: 'text' })
  email: string;

  @Column({ name: 'estado', type: 'text', default: 'pendiente' })
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada';

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expira_en', type: 'timestamptz', default: () => "now() + interval '7 days'" })
  expiresAt: Date;

  @Column({ name: 'respondida_en', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
