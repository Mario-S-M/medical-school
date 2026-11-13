import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException, ERROR_MESSAGES } from '../../../common/utils/api-exception';
import { AppConfig } from '../../../config/configuration';
import { requestOf } from '../../security/utils/request-of';
import { constantTimeEquals } from '../utils/video-rules';

export const TRANSCODER_HEADER = 'x-secreto-transcodificador';

// Protege el webhook interno del transcodificador: exige `X-Secreto-Transcodificador` igual al secreto compartido
// (comparación en tiempo constante). Sin la cabecera o con otra distinta: 403 SIN_PERMISO. No usa la guardia JWT.
@Injectable()
export class TranscoderSecretGuard implements CanActivate {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<AppConfig['transcoder']>('transcoder').secret;
  }

  canActivate(context: ExecutionContext): boolean {
    const header = requestOf(context).headers[TRANSCODER_HEADER];
    if (typeof header !== 'string' || !constantTimeEquals(header, this.secret)) throw new ApiException(403, 'SIN_PERMISO', ERROR_MESSAGES.SIN_PERMISO);
    return true;
  }
}
