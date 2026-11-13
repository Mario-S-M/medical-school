import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodeEvent } from '../entities/code-event.entity';
import {
  CodePurpose,
  ERRORS_WINDOW_SECONDS,
  ErrorCounts,
  REQUESTS_WINDOW_SECONDS,
  RequestCounts,
} from '../policies/code-limits.policy';

// Consulta de una sola pasada, como los workflows: borra de paso lo de más de 1 día y cuenta, en la ventana
// deslizante, los eventos del correo (solo su propósito) y de la IP (ambos propósitos). Cuenta por el texto del
// correo aunque la cuenta no exista.
const countsQuery = (type: 'solicitud' | 'error', seconds: number) => `
  WITH limpieza AS (
    DELETE FROM autenticacion.eventos_codigo WHERE creado_en < now() - interval '1 day'
  ),
  por_correo AS (
    SELECT count(*) AS n, min(creado_en) AS primero
    FROM autenticacion.eventos_codigo
    WHERE correo = $1 AND proposito = $3 AND tipo = '${type}' AND creado_en > now() - interval '${seconds} seconds'
  ),
  por_ip AS (
    SELECT count(*) AS n, min(creado_en) AS primero
    FROM autenticacion.eventos_codigo
    WHERE ip = $2::inet AND tipo = '${type}' AND creado_en > now() - interval '${seconds} seconds'
  )
  SELECT pc.n::int AS n_correo,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (pc.primero + interval '${seconds} seconds' - now()))))::int AS reintentar_correo,
         pi.n::int AS n_ip,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (pi.primero + interval '${seconds} seconds' - now()))))::int AS reintentar_ip
  FROM por_correo pc, por_ip pi`;

// Columnas del resultado de la consulta anterior (alias de SQL).
interface CountRow {
  n_correo: number;
  reintentar_correo: number;
  n_ip: number;
  reintentar_ip: number;
}

@Injectable()
export class CodeEventsRepository {
  constructor(@InjectRepository(CodeEvent) private readonly repository: Repository<CodeEvent>) {}

  private async count(type: 'solicitud' | 'error', seconds: number, email: string, ip: string, purpose: CodePurpose): Promise<CountRow> {
    const rows: CountRow[] = await this.repository.query(countsQuery(type, seconds), [email, ip, purpose]);
    return rows[0];
  }

  async countRequests(email: string, ip: string, purpose: CodePurpose): Promise<RequestCounts> {
    const row = await this.count('solicitud', REQUESTS_WINDOW_SECONDS, email, ip, purpose);
    return {
      emailRequests: Number(row.n_correo),
      emailRetryAfter: Number(row.reintentar_correo),
      ipRequests: Number(row.n_ip),
      ipRetryAfter: Number(row.reintentar_ip),
    };
  }

  async countErrors(email: string, ip: string, purpose: CodePurpose): Promise<ErrorCounts> {
    const row = await this.count('error', ERRORS_WINDOW_SECONDS, email, ip, purpose);
    return {
      emailErrors: Number(row.n_correo),
      emailRetryAfter: Number(row.reintentar_correo),
      ipErrors: Number(row.n_ip),
      ipRetryAfter: Number(row.reintentar_ip),
    };
  }

  async record(purpose: CodePurpose, type: 'solicitud' | 'error', email: string, ip: string): Promise<void> {
    await this.repository.insert({ purpose, type, email, ip });
  }
}
