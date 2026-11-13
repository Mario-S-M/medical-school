import { ArgsType, Field, ID } from '@nestjs/graphql';
import { IsBoolean, IsIn } from 'class-validator';
import { UuidField } from '../../../common/validators/field-rules';

export const ASSIGNABLE_ROLES = ['instructor', 'administrador'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// `asignar_rol(usuario_id, rol, activo)`. `equipo_apoyo` no se asigna a mano: lo da aceptar una invitación.
@ArgsType()
export class AssignRoleArgs {
  @Field(() => ID, { name: 'usuario_id' })
  @UuidField()
  usuario_id!: string;

  @Field(() => String, { name: 'rol', description: 'instructor o administrador.' })
  @IsIn(ASSIGNABLE_ROLES, { message: `Debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}.` })
  rol!: AssignableRole;

  @Field(() => Boolean, { name: 'activo', description: 'true da el rol y false lo quita.' })
  @IsBoolean({ message: 'Debe ser verdadero o falso.' })
  activo!: boolean;
}
