// Fecha límite de la invitación en español de México (zona de Ciudad de México), como en el workflow `invitar-al-equipo`.
export function formatDeadline(date: Date): string {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
}

export const INVITATION_TEMPLATE = 'team-invitation.html';

export const invitationSubject = (instructorName: string): string => `${instructorName} te invitó a su equipo de apoyo`;
