import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { uniformError } from '../../../common/utils/api-exception';
import { PlaybackVideo } from '../decorators/playback-video.decorator';
import { PlaybackTokenGuard } from '../guards/playback-token.guard';
import { PlayableVideo, PlaybackRepository } from '../repositories/playback.repository';
import { PlaylistService } from '../services/playlist.service';

const KEY_BYTES = 16;

// Borde REST de la reproducción: la lista y la clave del video. Ambas con el token de reproducción en `Authorization`
// (nunca en la URL) y `no-store`. Cuentan para el límite general de 120 peticiones por minuto y por IP.
@Controller('api/v1/reproducciones/:video_id')
@UseGuards(PlaybackTokenGuard)
export class PlaybackController {
  constructor(
    private readonly playlists: PlaylistService,
    private readonly repository: PlaybackRepository,
  ) {}

  @Get('lista.m3u8')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  list(@PlaybackVideo() video: PlayableVideo): Promise<string> {
    return this.playlists.build(video);
  }

  // Única ruta que entrega la clave AES-128 (los 16 bytes de `claves_video.clave`).
  @Get('clave')
  @Header('Content-Type', 'application/octet-stream')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async key(@PlaybackVideo() video: PlayableVideo): Promise<Buffer> {
    const key = await this.repository.readKey(video.id);
    if (!key || key.length !== KEY_BYTES) throw uniformError(500, 'ERROR_INTERNO');
    return key;
  }
}
