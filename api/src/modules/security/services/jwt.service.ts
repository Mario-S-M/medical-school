import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import { ApiException } from '../../../common/utils/api-exception';
import { AuthenticatedUser } from '../utils/authenticated-user';
import { verifyJwt } from '../utils/verify-jwt';

export const INVALID_TOKEN_MESSAGE = 'El token de acceso falta, no es válido o expiró.';

// Verificación local del token de acceso de Supabase (sin llamar a Supabase Auth). La reutiliza GraphQL (SPEC 09, paso 5).
@Injectable()
export class JwtService {
  private readonly jwt: AppConfig['jwt'];

  constructor(config: ConfigService) {
    this.jwt = config.getOrThrow<AppConfig['jwt']>('jwt');
  }

  // `authorizationHeader` es el valor crudo de `Authorization`. Lanza 401 TOKEN_INVALIDO si no sirve.
  authenticate(authorizationHeader: string | undefined): AuthenticatedUser {
    const match = /^Bearer (\S+)$/.exec(authorizationHeader ?? '');
    const payload = match ? verifyJwt(match[1], { secret: this.jwt.secret, issuer: this.jwt.issuer }) : null;
    if (!match || !payload) throw new ApiException(401, 'TOKEN_INVALIDO', INVALID_TOKEN_MESSAGE);
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.user_metadata?.nombre === 'string' ? payload.user_metadata.nombre : null,
      role: typeof payload.role === 'string' ? payload.role : null,
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
      token: match[1],
    };
  }
}
