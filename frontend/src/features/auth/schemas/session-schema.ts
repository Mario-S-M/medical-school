import { z } from 'zod';

export const userSchema = z.object({ id: z.string(), correo: z.string(), nombre: z.string() });
export type User = z.infer<typeof userSchema>;

export const sessionResponseSchema = z.object({
  token_acceso: z.string(),
  tipo_token: z.literal('Bearer'),
  expira_en: z.number(),
  usuario: userSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const messageSchema = z.object({ mensaje: z.string() });
export type Message = z.infer<typeof messageSchema>;
