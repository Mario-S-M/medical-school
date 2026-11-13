import { Injectable, Logger } from '@nestjs/common';
import { uniformError } from '../../../common/utils/api-exception';
import { StorageService } from '../../storage/services/storage.service';
import { PlayableVideo } from '../repositories/playback.repository';
import { parsePlaylist, rewritePlaylist } from '../utils/playlist';
import { PlaybackTokenService } from './playback-token.service';

export const VIDEOS_BUCKET = 'videos';
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

// Arma la lista que ve el navegador: lee `<ruta_base>/hls/lista.m3u8` del bucket privado, deja intacto el `#EXT-X-KEY`
// (su `URI="clave"` resuelve, relativo a `/api/v1/reproducciones/<id>/lista.m3u8`, a la ruta de la clave) y cambia cada segmento
// por una URL firmada de Storage con la vida de la autorización, todas en una sola llamada por lotes.
@Injectable()
export class PlaylistService {
  private readonly logger = new Logger('PlaylistService');

  constructor(
    private readonly storage: StorageService,
    private readonly tokens: PlaybackTokenService,
  ) {}

  async build(video: PlayableVideo): Promise<string> {
    const folder = `${video.basePath}/hls`;
    const text = await this.storage.downloadText(VIDEOS_BUCKET, `${folder}/lista.m3u8`, MAX_PLAYLIST_BYTES);
    if (text === null) {
      this.logger.error(`El video ${video.id} está listo pero no tiene lista.m3u8 en Storage`);
      throw uniformError(500, 'ERROR_INTERNO');
    }
    const parsed = parsePlaylist(text);
    const names = [...new Set(parsed.segments)];
    const signed = await this.storage.signDownloads(
      VIDEOS_BUCKET,
      names.map((name) => `${folder}/${name}`),
      this.tokens.lifetimeSeconds,
    );
    // Las URL salen por el mismo camino que las subidas: el navegador las pide bajo `/almacen`, que lleva a Storage.
    const urls = new Map(names.map((name, i) => [name, `/almacen${signed[i]}`]));
    return rewritePlaylist(parsed, urls);
  }
}
