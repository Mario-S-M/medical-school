import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'autenticacion', name: 'contrasenas_comunes' })
export class CommonPassword {
  @PrimaryColumn({ name: 'contrasena', type: 'text' })
  password: string;
}
