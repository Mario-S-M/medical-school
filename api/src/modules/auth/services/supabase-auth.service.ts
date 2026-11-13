import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import { uniformError } from '../../../common/utils/api-exception';

export interface SupabaseResponse {
  status: number;
  body: Record<string, unknown>; // `{}` si la respuesta no es un objeto JSON
}

interface CallOptions {
  query?: Record<string, string>;
  body?: unknown;
  authorization?: string;
}

// Cliente de Supabase Auth (GoTrue) en la red interna. Igual que los workflows: no manda `apikey`, y los
// errores HTTP del servicio se devuelven a quien llama para que los traduzca. Un fallo de red, un tiempo
// agotado o una respuesta ilegible dan 500 ERROR_INTERNO sin filtrar nada (solo se registra el tipo de fallo).
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger('SupabaseAuthService');
  private readonly auth: AppConfig['auth'];

  constructor(config: ConfigService) {
    this.auth = config.getOrThrow<AppConfig['auth']>('auth');
  }

  signUp(email: string, password: string, name: string): Promise<SupabaseResponse> {
    return this.call('POST', '/signup', { body: { email, password, data: { nombre: name } } });
  }

  signIn(email: string, password: string): Promise<SupabaseResponse> {
    return this.call('POST', '/token', { query: { grant_type: 'password' }, body: { email, password } });
  }

  refreshSession(refreshToken: string): Promise<SupabaseResponse> {
    return this.call('POST', '/token', { query: { grant_type: 'refresh_token' }, body: { refresh_token: refreshToken } });
  }

  // Por defecto revoca solo la sesión del token de acceso dado (`scope=local`); con `global`, todas las del usuario.
  signOut(accessToken: string, scope: 'local' | 'global' = 'local'): Promise<SupabaseResponse> {
    return this.call('POST', '/logout', { query: { scope }, authorization: `Bearer ${accessToken}` });
  }

  // Canjea un código de 6 dígitos. Supabase devuelve una sesión que quien llama debe usar o descartar.
  redeemCode(type: 'signup' | 'recovery', email: string, code: string): Promise<SupabaseResponse> {
    return this.call('POST', '/verify', { body: { type, email, token: code } });
  }

  resendVerification(email: string): Promise<SupabaseResponse> {
    return this.call('POST', '/resend', { body: { type: 'signup', email } });
  }

  requestRecovery(email: string): Promise<SupabaseResponse> {
    return this.call('POST', '/recover', { body: { email } });
  }

  changePassword(accessToken: string, newPassword: string): Promise<SupabaseResponse> {
    return this.call('PUT', '/user', { body: { password: newPassword }, authorization: `Bearer ${accessToken}` });
  }

  private async call(method: string, path: string, options: CallOptions): Promise<SupabaseResponse> {
    const url = new URL(`${this.auth.url}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.authorization) headers.Authorization = options.authorization;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'error',
        signal: AbortSignal.timeout(this.auth.timeoutMs),
      });
      const text = await response.text();
      return { status: response.status, body: this.asObject(text) };
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'desconocido';
      this.logger.error(`Fallo al llamar a Supabase Auth ${path}: ${kind}`);
      throw uniformError(500, 'ERROR_INTERNO');
    }
  }

  private asObject(text: string): Record<string, unknown> {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
