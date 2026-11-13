import { z } from 'zod';

export const myTeamSchema = z.object({
  miembros: z.array(z.object({ miembro_id: z.string(), correo: z.string().nullish(), desde: z.string() })),
  invitaciones: z.array(z.object({ id: z.number(), correo: z.string(), expira_en: z.string() })),
});

export const receivedInvitationSchema = z.object({
  id: z.number(),
  instructor: z.string(),
  creado_en: z.string(),
  expira_en: z.string(),
});
export type ReceivedInvitation = z.infer<typeof receivedInvitationSchema>;
export const myInvitationsSchema = z.array(receivedInvitationSchema);

export const invitedSchema = z.object({ id: z.number(), expira_en: z.string(), correo_enviado: z.boolean() });
export const answeredSchema = z.object({ aceptada: z.boolean() });
