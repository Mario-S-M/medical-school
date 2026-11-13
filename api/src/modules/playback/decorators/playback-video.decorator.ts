import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PlayableVideo } from '../repositories/playback.repository';

// El video de la ruta, ya comprobado por `PlaybackTokenGuard` (vigente y `listo`).
export const PlaybackVideo = createParamDecorator((_data: unknown, context: ExecutionContext): PlayableVideo | undefined => {
  return context.switchToHttp().getRequest<FastifyRequest>().playbackVideo;
});
