import { formatDeadline, invitationSubject } from './invitation-mail';

describe('invitation-mail', () => {
  it('da la fecha límite en español de México', () => {
    expect(formatDeadline(new Date('2026-11-20T18:00:00Z'))).toBe('20 de noviembre de 2026');
  });
  it('usa la zona de Ciudad de México (a las 03:00 UTC aún es el día anterior)', () => {
    expect(formatDeadline(new Date('2026-11-20T03:00:00Z'))).toBe('19 de noviembre de 2026');
  });
  it('arma el asunto con el nombre del instructor', () => {
    expect(invitationSubject('Ana Pérez')).toBe('Ana Pérez te invitó a su equipo de apoyo');
  });
});
