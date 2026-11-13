import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'autenticacion', name: 'intentos_inicio_sesion' })
export class LoginAttempt {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'correo', type: 'text' })
  email: string;

  @Column({ type: 'inet' })
  ip: string;

  @Column({ name: 'exitoso', type: 'boolean' })
  succeeded: boolean;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
