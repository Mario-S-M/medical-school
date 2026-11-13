import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';

export interface TranscoderJob {
  videoId: number;
  originalPath: string;
  basePath: string;
  keyHex: string;
}

// Cliente del transcodificador (`POST ${URL_TRANSCODIFICADOR}/trabajos`, red interna). Lleva el secreto compartido en la
// cabecera `X-Secreto-Transcodificador`. Ni el secreto ni la clave del video llegan nunca al registro.
@Injectable()
export class TranscoderClient {
  private readonly logger = new Logger('TranscoderClient');
  private readonly transcoder: AppConfig['transcoder'];

  constructor(config: ConfigService) {
    this.transcoder = config.getOrThrow<AppConfig['transcoder']>('transcoder');
  }

  // `true` solo si el servicio aceptó el trabajo (202). Un fallo de red, un tiempo agotado o cualquier otra respuesta es `false`.
  async requestJob(job: TranscoderJob): Promise<boolean> {
    try {
      const response = await fetch(`${this.transcoder.url}/trabajos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Secreto-Transcodificador': this.transcoder.secret },
        body: JSON.stringify({ video_id: job.videoId, ruta_original: job.originalPath, ruta_base: job.basePath, clave_hex: job.keyHex }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.transcoder.timeoutMs),
      });
      await response.body?.cancel();
      if (response.status !== 202) this.logger.warn(`El transcodificador rechazó el video ${job.videoId} (HTTP ${response.status})`);
      return response.status === 202;
    } catch (error) {
      this.logger.error(`No se pudo hablar con el transcodificador (${error instanceof Error ? error.name : 'desconocido'})`);
      return false;
    }
  }
}
