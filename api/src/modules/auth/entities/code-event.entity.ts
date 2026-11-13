import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'autenticacion', name: 'eventos_codigo' })
export class CodeEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'proposito', type: 'text' })
  purpose: 'verificacion' | 'recuperacion';

  @Column({ name: 'tipo', type: 'text' })
  type: 'solicitud' | 'error';

  @Column({ name: 'correo', type: 'text' })
  email: string;

  @Column({ type: 'inet' })
  ip: string;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
