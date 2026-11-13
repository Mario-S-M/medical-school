import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity';
import { LOCKOUT_WINDOW_SECONDS, LoginAttemptCounts } from '../policies/lockout.policy';

const WINDOW = `now() - interval '${LOCKOUT_WINDOW_SECONDS} seconds'`;
const secondsRemaining = (first: string) =>
  `GREATEST(1, CEIL(EXTRACT(EPOCH FROM (${first} + interval '${LOCKOUT_WINDOW_SECONDS} seconds' - now()))))::int`;

@Injectable()
export class LoginAttemptsRepository {
  constructor(@InjectRepository(LoginAttempt) private readonly repository: Repository<LoginAttempt>) {}

  // Borra de paso lo de más de 24 h (se llama en cada inicio de sesión, como el workflow).
  async deleteOld(): Promise<void> {
    await this.repository.createQueryBuilder().delete().where(`creado_en < now() - interval '1 day'`).execute();
  }

  // Fallos de la ventana de 15 min. Los de un correo cuentan solo desde su último inicio de sesión exitoso.
  async countFailures(email: string, ip: string): Promise<LoginAttemptCounts> {
    const byEmail = await this.repository
      .createQueryBuilder('i')
      .select('count(*)::int', 'n')
      .addSelect(secondsRemaining('min(i.creado_en)'), 'retry')
      .where('i.correo = :email AND NOT i.exitoso', { email })
      .andWhere(`i.creado_en > ${WINDOW}`)
      .andWhere(
        `i.creado_en > coalesce((SELECT max(creado_en) FROM autenticacion.intentos_inicio_sesion WHERE correo = :email AND exitoso), '-infinity'::timestamptz)`,
      )
      .getRawOne<{ n: number; retry: number | null }>();
    const byIp = await this.repository
      .createQueryBuilder('i')
      .select('count(*)::int', 'n')
      .addSelect(secondsRemaining('min(i.creado_en)'), 'retry')
      .where('i.ip = CAST(:ip AS inet) AND NOT i.exitoso', { ip })
      .andWhere(`i.creado_en > ${WINDOW}`)
      .getRawOne<{ n: number; retry: number | null }>();
    return {
      emailFailures: Number(byEmail?.n ?? 0),
      emailRetryAfter: Number(byEmail?.retry ?? 1),
      ipFailures: Number(byIp?.n ?? 0),
      ipRetryAfter: Number(byIp?.retry ?? 1),
    };
  }

  async record(email: string, ip: string, succeeded: boolean): Promise<void> {
    await this.repository.insert({ email, ip, succeeded });
  }
}
