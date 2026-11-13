import { TeamService } from './team.service';

const NOW = new Date('2026-11-20T18:00:00Z');
const ACCOUNT = { id: 'miembro', email: 'invitada@example.com', name: 'Ana', verified: true };

function build(overrides: { account?: unknown; created?: unknown; sent?: boolean } = {}) {
  const repository = {
    closeExpired: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(overrides.created ?? { result: 'ok', id: 7, expiresAt: NOW, instructor: 'Ada & Co' }),
  };
  const authAdmin = { findByEmail: jest.fn().mockResolvedValue('account' in overrides ? overrides.account : ACCOUNT) };
  const mail = { send: jest.fn().mockResolvedValue(overrides.sent ?? true) };
  const templates = { render: jest.fn().mockReturnValue('<html/>') };
  const service = new TeamService(repository as never, authAdmin as never, mail as never, templates as never);
  return { service, repository, authAdmin, mail, templates };
}

describe('TeamService.invite', () => {
  it('manda el correo con el asunto del workflow y devuelve id, vencimiento y correo_enviado', async () => {
    const { service, mail, templates, repository } = build();
    expect(await service.invite('instructor', 'invitada@example.com')).toEqual({ id: 7, expiresAt: NOW.toISOString(), emailSent: true });
    expect(repository.closeExpired).toHaveBeenCalledWith('instructor', 'miembro');
    expect(templates.render).toHaveBeenCalledWith('team-invitation.html', { nombre_instructor: 'Ada & Co', fecha_limite: '20 de noviembre de 2026' });
    expect(mail.send).toHaveBeenCalledWith({ to: 'invitada@example.com', subject: 'Ada & Co te invitó a su equipo de apoyo', html: '<html/>' });
  });

  it('si el SMTP falla la invitación existe igual y correo_enviado es false (como el workflow)', async () => {
    const { service } = build({ sent: false });
    expect(await service.invite('instructor', 'invitada@example.com')).toMatchObject({ id: 7, emailSent: false });
  });

  it('cuenta inexistente o sin verificar: 404 USUARIO_NO_REGISTRADO y no toca la base ni manda correo', async () => {
    const missing = build({ account: null });
    await expect(missing.service.invite('instructor', 'x@example.com')).rejects.toMatchObject({ code: 'USUARIO_NO_REGISTRADO', apiMessage: 'Ese correo no tiene una cuenta registrada.' });
    const unverified = build({ account: { ...ACCOUNT, verified: false } });
    await expect(unverified.service.invite('instructor', 'x@example.com')).rejects.toMatchObject({ code: 'USUARIO_NO_REGISTRADO', apiMessage: 'Esa cuenta todavía no verificó su correo.' });
    for (const { repository, mail } of [missing, unverified]) {
      expect(repository.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    }
  });

  it('invitarse a uno mismo: 409 ESTADO_INVALIDO', async () => {
    const { service, repository } = build({ account: { ...ACCOUNT, id: 'instructor' } });
    await expect(service.invite('instructor', 'x@example.com')).rejects.toMatchObject({ code: 'ESTADO_INVALIDO', apiMessage: 'No puedes invitarte a ti mismo.' });
    expect(repository.closeExpired).not.toHaveBeenCalled();
  });

  it('ya es miembro o ya hay una vigente: 409 y sin correo', async () => {
    const member = build({ created: { result: 'ya_es_miembro' } });
    await expect(member.service.invite('instructor', 'x@example.com')).rejects.toMatchObject({ code: 'YA_ES_MIEMBRO', apiMessage: 'Esa persona ya está en tu equipo.' });
    const duplicate = build({ created: { result: 'duplicada' } });
    await expect(duplicate.service.invite('instructor', 'x@example.com')).rejects.toMatchObject({ code: 'INVITACION_DUPLICADA', apiMessage: 'Ya hay una invitación pendiente para esa persona.' });
    expect(member.mail.send).not.toHaveBeenCalled();
    expect(duplicate.mail.send).not.toHaveBeenCalled();
  });
});

describe('TeamService respuestas y retiros', () => {
  const repo = (value: boolean) => ({ answer: jest.fn().mockResolvedValue(value), cancel: jest.fn().mockResolvedValue(value), removeMember: jest.fn().mockResolvedValue(value) });
  const make = (value: boolean) => new TeamService(repo(value) as never, {} as never, {} as never, {} as never);

  it('responder devuelve aceptada o NO_ENCONTRADO con el mensaje del workflow', async () => {
    expect(await make(true).answer('u', 1, false)).toEqual({ accepted: false });
    await expect(make(false).answer('u', 1, true)).rejects.toMatchObject({ code: 'NO_ENCONTRADO', apiMessage: 'La invitación no existe en este curso.' });
  });
  it('cancelar y quitar dan NO_ENCONTRADO con su mensaje cuando no hay nada que cambiar', async () => {
    await expect(make(true).cancel('i', 1)).resolves.toBeUndefined();
    await expect(make(false).cancel('i', 1)).rejects.toMatchObject({ code: 'NO_ENCONTRADO', apiMessage: 'La invitación pendiente no existe en este curso.' });
    await expect(make(true).removeMember('i', 'm')).resolves.toBeUndefined();
    await expect(make(false).removeMember('i', 'm')).rejects.toMatchObject({ code: 'NO_ENCONTRADO', apiMessage: 'El miembro no existe en este curso.' });
  });
});
