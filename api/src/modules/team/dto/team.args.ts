import { ArgsType, Field, ID } from '@nestjs/graphql';
import { IsBoolean } from 'class-validator';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { EmailField, IntegerField, UuidField } from '../../../common/validators/field-rules';

// `invitar_equipo(correo)`: el correo se recorta y se pasa a minúsculas.
@ArgsType()
export class InviteTeamArgs {
  @Field(() => String, { name: 'correo' })
  @EmailField()
  correo!: string;
}

// `responder_invitacion(invitacion_id, aceptar)`.
@ArgsType()
export class AnswerInvitationArgs {
  @Field(() => BigIntScalar, { name: 'invitacion_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  invitacion_id!: number;

  @Field(() => Boolean, { name: 'aceptar', description: 'true entra al equipo; false rechaza.' })
  @IsBoolean({ message: 'Debe ser verdadero o falso.' })
  aceptar!: boolean;
}

// `cancelar_invitacion(invitacion_id)`.
@ArgsType()
export class CancelInvitationArgs {
  @Field(() => BigIntScalar, { name: 'invitacion_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  invitacion_id!: number;
}

// `quitar_miembro(miembro_id)`.
@ArgsType()
export class RemoveMemberArgs {
  @Field(() => ID, { name: 'miembro_id' })
  @UuidField()
  miembro_id!: string;
}
