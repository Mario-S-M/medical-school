import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniformError } from '../../../common/utils/api-exception';
import { AppConfig } from '../../../config/configuration';

// Cuenta de Supabase Auth, con los campos que usa la escuela.
export interface AuthAccount {
  id: string;
  email: string;
  name: string | null;
  verified: boolean;
}

interface RawUser {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  user_metadata?: { nombre?: unknown } | null;
}

// API admin de Supabase Auth con la clave de servicio (`SERVICE_ROLE_KEY`, que nunca sale en una respuesta ni en el registro).
// Como en los workflows `buscar-cuenta-por-correo` y `asignar-rol`. Un fallo de red, un tiempo agotado o una respuesta
// inesperada dan 500 ERROR_INTERNO sin filtrar nada.
@Injectable()
export class AuthAdminService {
  private readonly logger = new Logger('AuthAdminService');
  private readonly auth: AppConfig['auth'];

  constructor(config: ConfigService) {
    this.auth = config.getOrThrow<AppConfig['auth']>('auth');
  }

  // El filtro de la API admin busca por trozo de correo: aquí se elige solo la cuenta con el correo exacto (en minúsculas).
  async findByEmail(email: string): Promise<AuthAccount | null> {
    const response = await this.call(`/admin/users?filter=${encodeURIComponent(email)}`);
    const users = (response.body as { users?: unknown } | null)?.users;
    if (response.status !== 200 || !Array.isArray(users)) throw uniformError(500, 'ERROR_INTERNO');
    const found = (users as RawUser[]).find((u) => String(u.email ?? '').toLowerCase() === email);
    return found ? this.toAccount(found) : null;
  }

  async findById(id: string): Promise<AuthAccount | null> {
    const response = await this.call(`/admin/users/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    const user = response.body as RawUser | null;
    if (response.status !== 200 || !user || typeof user.id !== 'string') throw uniformError(500, 'ERROR_INTERNO');
    return this.toAccount(user);
  }

  private toAccount(user: RawUser): AuthAccount {
    const name = user.user_metadata?.nombre;
    return {
      id: String(user.id),
      email: String(user.email ?? ''),
      name: typeof name === 'string' && name !== '' ? name : null,
      verified: Boolean(user.email_confirmed_at),
    };
  }

  private async call(path: string): Promise<{ status: number; body: unknown }> {
    try {
      const response = await fetch(`${this.auth.url}${path}`, {
        // `apikey` lo exige el gateway (Kong) cuando se llega por fuera de la red de Docker; GoTrue la ignora.
        headers: { Authorization: `Bearer ${this.auth.serviceKey}`, apikey: this.auth.serviceKey },
        redirect: 'error',
        signal: AbortSignal.timeout(this.auth.timeoutMs),
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: response.status, body };
    } catch (error) {
      this.logger.error(`Fallo al llamar a la API admin de Supabase Auth (${error instanceof Error ? error.name : 'desconocido'})`);
      throw uniformError(500, 'ERROR_INTERNO');
    }
  }
}
