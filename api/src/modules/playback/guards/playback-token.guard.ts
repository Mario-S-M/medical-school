import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiException, ERROR_MESSAGES } from '../../../common/utils/api-exception';
import { PlayableVideo, PlaybackRepository } from '../repositories/playback.repository';
import { PlaybackTokenService } from '../services/playback-token.service';

declare module 'fastify' {
  interface FastifyRequest {
    playbackVideo?: PlayableVideo;
  }
}

// Exige `Authorization: Bearer <token de reproducción>` y que sea de ESTE video, en este orden:
//   1. token ausente, caducado, con otra audiencia o mal firmado -> 401 TOKEN_INVALIDO
//   2. `vid` del token distinto del `{video_id}` de la ruta -> 403 SIN_PERMISO
//   3. el video ya no es el vigente o no está `listo` -> 404 NO_ENCONTRADO
@Injectable()
export class PlaybackTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: PlaybackTokenService,
    private readonly repository: PlaybackRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const claims = this.tokens.verify(request.headers.authorization);
    const { video_id: routeVideoId } = request.params as { video_id?: string };
    if (String(claims.videoId) !== routeVideoId) throw new ApiException(403, 'SIN_PERMISO', ERROR_MESSAGES.SIN_PERMISO);
    const video = await this.repository.findPlayable(claims.videoId);
    if (!video) throw new ApiException(404, 'NO_ENCONTRADO', ERROR_MESSAGES.NO_ENCONTRADO);
    request.playbackVideo = video;
    return true;
  }
}
