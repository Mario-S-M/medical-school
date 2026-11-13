import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../../../common/utils/api-exception';
import { AppConfig } from '../../../config/configuration';
import { INVALID_TOKEN_MESSAGE } from '../../security/services/jwt.service';
import { signJwt } from '../../security/utils/sign-jwt';
import { verifyJwt } from '../../security/utils/verify-jwt';

export const PLAYBACK_AUDIENCE = 'reproduccion';

export interface PlaybackClaims {
  userId: string;
  videoId: number;
  lessonId: number;
}

export interface IssuedPlaybackToken {
  token: string;
  expiresIn: number; // segundos de vida
}

// Token de reproducción (SPEC 12): JWT HS256 con el mismo `JWT_SECRET` pero audiencia propia, atado a una cuenta, un video y
// una clase. No se guarda en ninguna parte. El token de acceso (`aud: authenticated`) no pasa por aquí ni éste por `JwtService`.
@Injectable()
export class PlaybackTokenService {
  private readonly jwt: AppConfig['jwt'];
  private readonly seconds: number;

  constructor(config: ConfigService) {
    this.jwt = config.getOrThrow<AppConfig['jwt']>('jwt');
    this.seconds = config.getOrThrow<AppConfig['playback']>('playback').authorizationSeconds;
  }

  get lifetimeSeconds(): number {
    return this.seconds;
  }

  issue(claims: PlaybackClaims): IssuedPlaybackToken {
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { iss: this.jwt.issuer, aud: PLAYBACK_AUDIENCE, sub: claims.userId, vid: claims.videoId, cid: claims.lessonId, iat: issuedAt, exp: issuedAt + this.seconds },
      this.jwt.secret,
    );
    return { token, expiresIn: this.seconds };
  }

  // `authorizationHeader` es el valor crudo de `Authorization`. Lanza 401 TOKEN_INVALIDO si no sirve.
  verify(authorizationHeader: string | undefined): PlaybackClaims {
    const match = /^Bearer (\S+)$/.exec(authorizationHeader ?? '');
    const payload = match ? verifyJwt(match[1], { secret: this.jwt.secret, issuer: this.jwt.issuer, audience: PLAYBACK_AUDIENCE }) : null;
    if (!payload || !Number.isSafeInteger(payload.vid) || !Number.isSafeInteger(payload.cid)) {
      throw new ApiException(401, 'TOKEN_INVALIDO', INVALID_TOKEN_MESSAGE);
    }
    return { userId: payload.sub, videoId: payload.vid as number, lessonId: payload.cid as number };
  }
}
