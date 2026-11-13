import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { OkResult } from '../../../common/models/ok-result.model';
import { Authenticated } from '../../graphql/decorators/authenticated.decorator';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { AnswerInvitationArgs, CancelInvitationArgs, InviteTeamArgs, RemoveMemberArgs } from '../dto/team.args';
import { CreatedInvitation, InvitationAnswer, MyTeam, ReceivedInvitation } from '../models/team.models';
import { TeamService } from '../services/team.service';

// El rol lo exige `@Roles` (antes de validar); las demás reglas viven en `TeamService`.
@Resolver()
export class TeamResolver {
  constructor(private readonly team: TeamService) {}

  @Query(() => MyTeam, { name: 'mi_equipo', description: 'Miembros e invitaciones pendientes del equipo de apoyo (instructor).' })
  @Roles('instructor')
  myTeam(@CurrentUser() user: AuthenticatedUser): Promise<MyTeam> {
    return this.team.myTeam(user.id);
  }

  @Query(() => [ReceivedInvitation], { name: 'mis_invitaciones', description: 'Invitaciones pendientes y vigentes de la persona con sesión.' })
  @Authenticated()
  myInvitations(@CurrentUser() user: AuthenticatedUser): Promise<ReceivedInvitation[]> {
    return this.team.myInvitations(user.id);
  }

  @Mutation(() => CreatedInvitation, { name: 'invitar_equipo', description: 'Invita por correo a una cuenta registrada y verificada a tu equipo de apoyo (instructor).' })
  @Roles('instructor')
  invite(@CurrentUser() user: AuthenticatedUser, @Args() args: InviteTeamArgs): Promise<CreatedInvitation> {
    return this.team.invite(user.id, args.correo);
  }

  @Mutation(() => InvitationAnswer, { name: 'responder_invitacion', description: 'Acepta o rechaza una invitación propia, pendiente y vigente.' })
  @Authenticated()
  answer(@CurrentUser() user: AuthenticatedUser, @Args() args: AnswerInvitationArgs): Promise<InvitationAnswer> {
    return this.team.answer(user.id, args.invitacion_id, args.aceptar);
  }

  @Mutation(() => OkResult, { name: 'cancelar_invitacion', description: 'Cancela una invitación pendiente del instructor.' })
  @Roles('instructor')
  async cancel(@CurrentUser() user: AuthenticatedUser, @Args() args: CancelInvitationArgs): Promise<OkResult> {
    await this.team.cancel(user.id, args.invitacion_id);
    return { ok: true };
  }

  @Mutation(() => OkResult, { name: 'quitar_miembro', description: 'Quita a una persona de tu equipo de apoyo y, si no sigue en otro, su rol equipo_apoyo (instructor).' })
  @Roles('instructor')
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Args() args: RemoveMemberArgs): Promise<OkResult> {
    await this.team.removeMember(user.id, args.miembro_id);
    return { ok: true };
  }
}
