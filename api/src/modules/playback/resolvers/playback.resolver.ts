import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Authenticated } from '../../graphql/decorators/authenticated.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { PlaybackLessonArgs } from '../dto/playback.args';
import { PlaybackAuthorization } from '../models/playback.models';
import { PlaybackAccessService } from '../services/playback-access.service';
import { PlaybackTokenService } from '../services/playback-token.service';

@Resolver()
export class PlaybackResolver {
  constructor(
    private readonly access: PlaybackAccessService,
    private readonly tokens: PlaybackTokenService,
  ) {}

  @Mutation(() => PlaybackAuthorization, { name: 'autorizar_reproduccion', description: 'Comprueba si la cuenta puede ver la clase y entrega un token de reproducción de vida corta. No guarda nada.' })
  @Authenticated()
  async authorize(@CurrentUser() user: AuthenticatedUser, @Args() args: PlaybackLessonArgs): Promise<PlaybackAuthorization> {
    const video = await this.access.authorize(user.id, args.clase_id);
    const { token, expiresIn } = this.tokens.issue({ userId: user.id, videoId: video.id, lessonId: video.lessonId });
    return {
      video_id: video.id,
      token,
      expira_en: expiresIn,
      lista_url: `/api/v1/reproducciones/${video.id}/lista.m3u8`,
      duracion_segundos: video.durationSeconds,
      marca_agua: user.email ?? user.id,
    };
  }
}
