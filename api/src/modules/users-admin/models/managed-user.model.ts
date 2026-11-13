import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('UsuarioAdministrado', { description: 'Cuenta encontrada por un administrador, con sus roles de la escuela.' })
export class ManagedUser {
  @Field(() => ID, { name: 'id' })
  id!: string;

  @Field(() => String, { name: 'correo' })
  correo!: string;

  @Field(() => String, { name: 'nombre', nullable: true })
  nombre!: string | null;

  @Field(() => Boolean, { name: 'verificado' })
  verificado!: boolean;

  @Field(() => [String], { name: 'roles' })
  roles!: string[];
}

@ObjectType('RolAsignado', { description: 'Resultado de dar o quitar un rol.' })
export class AssignedRole {
  @Field(() => ID, { name: 'usuario_id' })
  usuario_id!: string;

  @Field(() => String, { name: 'rol' })
  rol!: string;

  @Field(() => Boolean, { name: 'activo' })
  activo!: boolean;
}
