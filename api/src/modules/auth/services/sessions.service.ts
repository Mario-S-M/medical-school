import { Injectable } from '@nestjs/common';
import { ApiException, uniformError } from '../../../common/utils/api-exception';
import { AuthenticatedUser } from '../../security/utils/authenticated-user';
import {
  clearedCookie,
  emailNotVerified,
  genericTooManyAttempts,
  insecurePassword,
  invalidCredentials,
  invalidSession,
  refreshCookie,
  validationFailed,
} from '../auth-errors';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { evaluateLockout } from '../policies/lockout.policy';
import { commonCandidates, evaluatePasswordPolicy, notCommonDetail } from '../policies/password.policy';
import { CommonPasswordsRepository } from '../repositories/common-passwords.repository';
import { LoginAttemptsRepository } from '../repositories/login-attempts.repository';
import { SupabaseAuthService, SupabaseResponse } from './supabase-auth.service';

export const ACCOUNT_CREATED_MESSAGE = 'Cuenta creada. Revisa tu correo y verifícala con el código que te enviamos.';
// Piso de duración del registro: iguala el tiempo de un correo nuevo (Supabase envía el correo) y de uno ya
// registrado (no lo envía), para que el tiempo no delate qué correos existen.
export const REGISTER_MIN_DURATION_MS = 600;

// Cuerpo de la respuesta de sesión: sus campos son el contrato JSON.
export interface SessionResponse {
  token_acceso: string;
  tipo_token: 'Bearer';
  expira_en: number;
  usuario: { id: string; correo: string; nombre: string | null };
}
export interface SessionResult {
  body: SessionResponse;
  cookie: string;
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class SessionsService {
  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly attempts: LoginAttemptsRepository,
    private readonly commonPasswords: CommonPasswordsRepository,
  ) {}

  async register({ email, name, password }: RegisterDto): Promise<{ mensaje: string }> {
    const details = evaluatePasswordPolicy(password, email);
    if (await this.commonPasswords.isCommon(commonCandidates(password))) details.push(notCommonDetail());
    if (details.length > 0) throw insecurePassword(details);

    const start = Date.now();
    const response = await this.supabase.signUp(email, password, name);
    const result = this.classifyRegistration(response);
    // Misma respuesta y mismo tiempo para correo nuevo y ya registrado.
    const remaining = REGISTER_MIN_DURATION_MS - (Date.now() - start);
    if (remaining > 0) await pause(remaining);
    if (result instanceof ApiException) throw result;
    return result;
  }

  private classifyRegistration({ status, body }: SupabaseResponse): { mensaje: string } | ApiException {
    const created = { mensaje: ACCOUNT_CREATED_MESSAGE };
    if (status >= 200 && status < 300) return created;
    // Correo ya registrado, o cuenta sin verificar registrada otra vez dentro del minuto de envío: igual que una nueva.
    if (['user_already_exists', 'email_exists', 'over_email_send_rate_limit'].includes(String(body.error_code))) return created;
    if (status === 400 || status === 422) {
      return validationFailed([{ campo: 'correo', regla: 'rechazado', mensaje: 'El correo no fue aceptado.' }]);
    }
    if (status === 429) return genericTooManyAttempts();
    return uniformError(500, 'ERROR_INTERNO');
  }

  async login({ email, password }: LoginDto, ip: string): Promise<SessionResult> {
    await this.attempts.deleteOld();
    const decision = evaluateLockout(await this.attempts.countFailures(email, ip));
    if (decision.blocked) {
      throw new ApiException(429, decision.code, decision.message, undefined, decision.seconds, {
        'Retry-After': String(decision.seconds),
      });
    }

    const { status, body } = await this.supabase.signIn(email, password);
    const session = this.readSession(status, body);
    if (session) {
      await this.attempts.record(email, ip, true);
      return session;
    }
    // Solo con la contraseña correcta Supabase responde esto: no cuenta como fallo.
    if (body.error_code === 'email_not_confirmed') throw emailNotVerified();
    if ([400, 401, 422].includes(status)) {
      await this.attempts.record(email, ip, false);
      throw invalidCredentials();
    }
    if (status === 429) throw genericTooManyAttempts();
    throw uniformError(500, 'ERROR_INTERNO');
  }

  async refresh(refreshToken: string): Promise<SessionResult> {
    const { status, body } = await this.supabase.refreshSession(refreshToken);
    const session = this.readSession(status, body);
    if (session) return session;
    if ([400, 401, 403, 404, 422].includes(status)) throw invalidSession();
    if (status === 429) throw genericTooManyAttempts();
    throw uniformError(500, 'ERROR_INTERNO');
  }

  // Revoca la sesión del token de acceso. Devuelve la cookie que borra el token de renovación.
  async logout(user: AuthenticatedUser): Promise<string> {
    const { status } = await this.supabase.signOut(user.token);
    if (status === 204 || status === 200) return clearedCookie();
    if ([400, 401, 403, 404].includes(status)) {
      throw new ApiException(401, 'TOKEN_INVALIDO', 'El token de acceso falta, no es válido o expiró.', undefined, undefined, {
        'Set-Cookie': clearedCookie(),
      });
    }
    if (status === 429) throw genericTooManyAttempts();
    throw uniformError(500, 'ERROR_INTERNO');
  }

  private readSession(status: number, b: Record<string, unknown>): SessionResult | null {
    const user = b.user as { id?: string; email?: string; user_metadata?: { nombre?: unknown } } | undefined;
    if (status !== 200 || typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string' || !user) return null;
    const name = user.user_metadata?.nombre;
    return {
      cookie: refreshCookie(b.refresh_token),
      body: {
        token_acceso: b.access_token,
        tipo_token: 'Bearer',
        expira_en: Number(b.expires_in),
        usuario: { id: String(user.id), correo: String(user.email), nombre: name === undefined ? null : (name as string | null) },
      },
    };
  }
}
