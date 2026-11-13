import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { VideoProcessedDto } from '../dto/video-processed.dto';
import { TranscoderSecretGuard } from '../guards/transcoder-secret.guard';
import { VideosService } from '../services/videos.service';

// Webhook interno: el transcodificador avisa el resultado del procesado. No usa la guardia JWT: lo protege el secreto
// compartido en `X-Secreto-Transcodificador` (403 SIN_PERMISO sin él o con otro). El puerto 3000 es el único de la API.
@Controller('api/v1/interno')
export class InternalVideosController {
  constructor(private readonly videos: VideosService) {}

  @Post('video-procesado')
  @HttpCode(200)
  @UseGuards(TranscoderSecretGuard)
  processed(@Body() dto: VideoProcessedDto): Promise<{ aplicado: boolean }> {
    return this.videos.applyResult(dto);
  }
}
