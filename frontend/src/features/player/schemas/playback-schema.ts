import { z } from 'zod';

export const playbackAuthorizationSchema = z.object({
  video_id: z.number(),
  token: z.string(),
  expira_en: z.number(),
  lista_url: z.string(),
  duracion_segundos: z.number().nullish(),
  marca_agua: z.string(),
});
export type PlaybackAuthorization = z.infer<typeof playbackAuthorizationSchema>;
