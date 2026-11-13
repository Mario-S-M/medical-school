import { Field, ID, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';

@ObjectType('MiembroEquipo', { description: 'Persona del equipo de apoyo del instructor.' })
export class TeamMemberModel {
  @Field(() => ID, { name: 'miembro_id' })
  memberId!: string;

  @Field(() => String, { name: 'desde', description: 'Fecha ISO 8601 en que entró al equipo.' })
  since!: string;

  @Field(() => String, { name: 'correo', nullable: true, description: 'Correo con el que aceptó la invitación (null si entró sin ella).' })
  email!: string | null;
}

@ObjectType('InvitacionEnviada', { description: 'Invitación pendiente y vigente que hizo el instructor.' })
export class SentInvitation {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'correo' })
  email!: string;

  @Field(() => String, { name: 'expira_en', description: 'Fecha ISO 8601.' })
  expiresAt!: string;
}

@ObjectType('MiEquipo', { description: 'Miembros e invitaciones pendientes del equipo de apoyo del instructor.' })
export class MyTeam {
  @Field(() => [TeamMemberModel], { name: 'miembros' })
  members!: TeamMemberModel[];

  @Field(() => [SentInvitation], { name: 'invitaciones' })
  invitations!: SentInvitation[];
}

@ObjectType('InvitacionRecibida', { description: 'Invitación pendiente y vigente que recibió la persona.' })
export class ReceivedInvitation {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'instructor', description: 'Nombre público del instructor que invita.' })
  instructor!: string;

  @Field(() => String, { name: 'creado_en', description: 'Fecha ISO 8601.' })
  createdAt!: string;

  @Field(() => String, { name: 'expira_en', description: 'Fecha ISO 8601.' })
  expiresAt!: string;
}

@ObjectType('InvitacionCreada', { description: 'Invitación creada; `correo_enviado` es false si el servidor de correo falló (la invitación existe igual).' })
export class CreatedInvitation {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'expira_en', description: 'Fecha ISO 8601.' })
  expiresAt!: string;

  @Field(() => Boolean, { name: 'correo_enviado' })
  emailSent!: boolean;
}

@ObjectType('RespuestaInvitacion', { description: 'Resultado de responder una invitación.' })
export class InvitationAnswer {
  @Field(() => Boolean, { name: 'aceptada' })
  accepted!: boolean;
}
