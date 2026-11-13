import { z } from 'zod';

export const rolesSchema = z.object({
  roles: z.array(z.string()),
  equipos: z.array(z.object({ instructor_id: z.string(), nombre_publico: z.string().nullable() })),
});
export type Roles = z.infer<typeof rolesSchema>;
