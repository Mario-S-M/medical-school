import { Injectable, Logger } from '@nestjs/common';
import { ApiException, uniformError } from '../../../common/utils/api-exception';
import { BackgroundService } from '../../../common/services/background.service';
import { genericTooManyAttempts, insecurePassword } from '../auth-errors';
import { EmailDto } from '../dto/email.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { CodeDecision, CodePurpose, evaluateErrors, evaluateRequests } from '../policies/code-limits.policy';
import { commonCandidates, evaluatePasswordPolicy, notCommonDetail } from '../policies/password.policy';
import { CodeEventsRepository } from '../repositories/code-events.repository';
import { CommonPasswordsRepository } from '../repositories/common-passwords.repository';
import { SupabaseAuthService, SupabaseResponse } from './supabase-auth.service';

export const EMAIL_VERIFIED_MESSAGE = 'Correo verificado. Ya puedes iniciar sesión.';
export const RESEND_MESSAGE = 'Si el correo está registrado y sin verificar, te enviamos un código.';
export const RECOVERY_MESSAGE = 'Si el correo está registrado, te enviamos un código.';
export const PASSWORD_UPDATED_MESSAGE = 'Contraseña actualizada. Inicia sesión con la nueva.';

const INVALID_CODE_STATUSES = [400, 401, 403, 404, 410, 422];

const invalidCode = (): ApiException => new ApiException(400, 'CODIGO_INVALIDO', 'El código no es válido o expiró.');

function blockedError(decision: Extract<CodeDecision, { blocked: true }>): ApiException {
  return new ApiException(429, decision.code, decision.message, undefined, decision.seconds, {
    'Retry-After': String(decision.seconds),
  });
}

@Injectable()
export class CodesService {
  private readonly logger = new Logger('CodesService');

  constructor(
    private readonly supabase: SupabaseAuthService,
    private readonly events: CodeEventsRepository,
    private readonly commonPasswords: CommonPasswordsRepository,
    private readonly background: BackgroundService,
  ) {}

  // Verifica el correo con el código. No abre sesión: la que crea Supabase se descarta y se revoca.
  async verifyEmail({ email, code }: VerifyEmailDto, ip: string): Promise<{ mensaje: string }> {
    await this.checkErrors(email, ip, 'verificacion');
    const response = await this.supabase.redeemCode('signup', email, code);
    if (response.status === 200) {
      await this.discardSession(response);
      return { mensaje: EMAIL_VERIFIED_MESSAGE };
    }
    throw await this.redeemError(response, email, ip, 'verificacion');
  }

  // Responde antes de llamar a Supabase Auth: el tiempo no depende de si el correo existe.
  async resendVerification({ email }: EmailDto, ip: string): Promise<{ mensaje: string }> {
    await this.recordRequest(email, ip, 'verificacion');
    this.background.launch('reenvío de verificación', async () => {
      this.warnIfFailed('reenvío de verificación', await this.supabase.resendVerification(email));
    });
    return { mensaje: RESEND_MESSAGE };
  }

  async requestRecovery({ email }: EmailDto, ip: string): Promise<{ mensaje: string }> {
    await this.recordRequest(email, ip, 'recuperacion');
    this.background.launch('solicitud de recuperación', async () => {
      this.warnIfFailed('solicitud de recuperación', await this.supabase.requestRecovery(email));
    });
    return { mensaje: RECOVERY_MESSAGE };
  }

  // Orden idéntico al del workflow: validación, límites, política de la contraseña (antes de gastar el código),
  // canje del código, cambio de contraseña y revocación de todas las sesiones.
  async resetPassword({ email, code, newPassword }: ResetPasswordDto, ip: string): Promise<{ mensaje: string }> {
    await this.checkErrors(email, ip, 'recuperacion');
    const details = evaluatePasswordPolicy(newPassword, email).map((d) => ({ ...d, campo: 'contrasena_nueva' }));
    if (await this.commonPasswords.isCommon(commonCandidates(newPassword))) details.push({ ...notCommonDetail(), campo: 'contrasena_nueva' });
    if (details.length > 0) throw insecurePassword(details);

    const redeemed = await this.supabase.redeemCode('recovery', email, code);
    const accessToken = typeof redeemed.body.access_token === 'string' ? redeemed.body.access_token : '';
    if (redeemed.status !== 200 || !accessToken) throw await this.redeemError(redeemed, email, ip, 'recuperacion');

    const change = await this.supabase.changePassword(accessToken, newPassword);
    const changed = change.status === 200;
    // Con la contraseña cambiada se revocan todas las sesiones; si no, solo la que creó el canje.
    const signOut = await this.supabase.signOut(accessToken, changed ? 'global' : 'local');
    if (changed) {
      if (signOut.status !== 204 && signOut.status !== 200) {
        this.logger.error(`No se pudieron revocar todas las sesiones tras restablecer (estado ${signOut.status})`);
      }
      return { mensaje: PASSWORD_UPDATED_MESSAGE };
    }
    if (change.status === 422 && change.body.error_code === 'same_password') {
      throw insecurePassword([{ campo: 'contrasena_nueva', regla: 'distinta_de_la_actual', mensaje: 'Debe ser distinta de la contraseña actual.' }]);
    }
    throw uniformError(500, 'ERROR_INTERNO');
  }

  private async checkErrors(email: string, ip: string, purpose: CodePurpose): Promise<void> {
    const decision = evaluateErrors(await this.events.countErrors(email, ip, purpose));
    if (decision.blocked) throw blockedError(decision);
  }

  // Cuenta solicitudes y registra la nueva; una solicitud rechazada por límite no se registra.
  private async recordRequest(email: string, ip: string, purpose: CodePurpose): Promise<void> {
    const decision = evaluateRequests(await this.events.countRequests(email, ip, purpose));
    if (decision.blocked) throw blockedError(decision);
    await this.events.record(purpose, 'solicitud', email, ip);
  }

  // Traduce un canje fallido; un código erróneo, vencido, usado o de un correo inexistente cuenta como error.
  private async redeemError({ status }: SupabaseResponse, email: string, ip: string, purpose: CodePurpose): Promise<ApiException> {
    if (INVALID_CODE_STATUSES.includes(status)) {
      await this.events.record(purpose, 'error', email, ip);
      return invalidCode();
    }
    if (status === 429) return genericTooManyAttempts();
    return uniformError(500, 'ERROR_INTERNO');
  }

  // Supabase crea una sesión al canjear el código de verificación: se revoca y no llega al cliente.
  private async discardSession({ body }: SupabaseResponse): Promise<void> {
    if (typeof body.access_token !== 'string') return;
    try {
      const { status } = await this.supabase.signOut(body.access_token, 'local');
      if (status !== 204 && status !== 200) this.logger.error(`No se pudo descartar la sesión de la verificación (estado ${status})`);
    } catch {
      // El correo ya quedó verificado; el fallo de red ya se registró en el servicio y el token vence solo.
    }
  }

  private warnIfFailed(task: string, { status }: SupabaseResponse): void {
    if (status < 200 || status >= 300) this.logger.warn(`Supabase Auth respondió ${status} en ${task}`);
  }
}
