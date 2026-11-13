import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { MailService } from '../../mail/services/mail.service';
import { MailTemplateService } from '../../mail/services/mail-template.service';
import { AuthAdminService } from '../../users-admin/services/auth-admin.service';
import { CreatedInvitation, MyTeam, ReceivedInvitation } from '../models/team.models';
import { TeamRepository } from '../repositories/team.repository';
import { formatDeadline, INVITATION_TEMPLATE, invitationSubject } from '../utils/invitation-mail';

// Equipo de apoyo del instructor e invitaciones (workflows `mi-equipo`, `invitar-al-equipo`, `mis-invitaciones`,
// `responder-invitacion`, `cancelar-invitacion` y `quitar-miembro`). El rol de quien llama lo exige `@Roles` en el resolver.
@Injectable()
export class TeamService {
  constructor(
    private readonly repository: TeamRepository,
    private readonly authAdmin: AuthAdminService,
    private readonly mail: MailService,
    private readonly templates: MailTemplateService,
  ) {}

  async myTeam(instructorId: string): Promise<MyTeam> {
    const [members, invitations] = await Promise.all([this.repository.findMembers(instructorId), this.repository.findSent(instructorId)]);
    return {
      members: members.map((m) => ({ memberId: m.memberId, since: m.since.toISOString(), email: m.email })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt.toISOString() })),
    };
  }

  async myInvitations(userId: string): Promise<ReceivedInvitation[]> {
    const rows = await this.repository.findReceived(userId);
    return rows.map((i) => ({ id: i.id, instructor: i.instructor, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() }));
  }

  // Orden de errores del workflow: cuenta inexistente o sin verificar (404 USUARIO_NO_REGISTRADO), uno mismo (409
  // ESTADO_INVALIDO), ya es miembro (409 YA_ES_MIEMBRO) y ya hay una vigente (409 INVITACION_DUPLICADA). Una invitación
  // vencida se cierra como `cancelada` antes de crear la nueva. Si el correo no sale, la invitación existe igual y
  // `correo_enviado` es false. `email` ya viene recortado y en minúsculas.
  async invite(instructorId: string, email: string): Promise<CreatedInvitation> {
    const account = await this.authAdmin.findByEmail(email);
    if (!account) throw new ApiException(404, 'USUARIO_NO_REGISTRADO', 'Ese correo no tiene una cuenta registrada.');
    if (!account.verified) throw new ApiException(404, 'USUARIO_NO_REGISTRADO', 'Esa cuenta todavía no verificó su correo.');
    if (account.id === instructorId) throw new ApiException(409, 'ESTADO_INVALIDO', 'No puedes invitarte a ti mismo.');

    await this.repository.closeExpired(instructorId, account.id);
    const created = await this.repository.create(instructorId, account.id, account.email);
    if (created.result === 'ya_es_miembro') throw new ApiException(409, 'YA_ES_MIEMBRO', 'Esa persona ya está en tu equipo.');
    if (created.result === 'duplicada') throw new ApiException(409, 'INVITACION_DUPLICADA', 'Ya hay una invitación pendiente para esa persona.');

    const emailSent = await this.mail.send({
      to: account.email,
      subject: invitationSubject(created.instructor),
      html: this.templates.render(INVITATION_TEMPLATE, { nombre_instructor: created.instructor, fecha_limite: formatDeadline(created.expiresAt) }),
    });
    return { id: created.id, expiresAt: created.expiresAt.toISOString(), emailSent };
  }

  async answer(userId: string, invitationId: number, accept: boolean): Promise<{ accepted: boolean }> {
    if (!(await this.repository.answer(invitationId, userId, accept))) {
      throw new ApiException(404, 'NO_ENCONTRADO', 'La invitación no existe en este curso.');
    }
    return { accepted: accept };
  }

  async cancel(instructorId: string, invitationId: number): Promise<void> {
    if (!(await this.repository.cancel(invitationId, instructorId))) {
      throw new ApiException(404, 'NO_ENCONTRADO', 'La invitación pendiente no existe en este curso.');
    }
  }

  async removeMember(instructorId: string, memberId: string): Promise<void> {
    if (!(await this.repository.removeMember(instructorId, memberId))) {
      throw new ApiException(404, 'NO_ENCONTRADO', 'El miembro no existe en este curso.');
    }
  }
}
