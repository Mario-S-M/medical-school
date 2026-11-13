import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'escuela', name: 'equipos_apoyo' })
export class TeamMember {
  @PrimaryColumn({ name: 'instructor_id', type: 'uuid' })
  instructorId: string;

  @PrimaryColumn({ name: 'miembro_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
