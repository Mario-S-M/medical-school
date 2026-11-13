import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MemberRow {
  memberId: string;
  since: Date;
  email: string | null;
}
export interface SentInvitationRow {
  id: number;
  email: string;
  expiresAt: Date;
}
export interface ReceivedInvitationRow {
  id: number;
  instructor: string;
  createdAt: Date;
  expiresAt: Date;
}
export type CreateOutcome = { result: 'ya_es_miembro' } | { result: 'duplicada' } | { result: 'ok'; id: number; expiresAt: Date; instructor: string };

// Consultas del equipo de apoyo y sus invitaciones (las mismas de los workflows `mi-equipo`, `invitar-al-equipo`,
// `mis-invitaciones`, `responder-invitacion`, `cancelar-invitacion` y `quitar-miembro`). Cada escritura es una sola
// sentencia, así que es atómica: el rol `equipo_apoyo` nunca queda a medias respecto de la fila del equipo.
@Injectable()
export class TeamRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findMembers(instructorId: string): Promise<MemberRow[]> {
    const rows = await this.dataSource.query<{ miembro_id: string; creado_en: Date; correo: string | null }[]>(
      `SELECT e.miembro_id, e.creado_en,
              (SELECT i.correo FROM escuela.invitaciones_equipo i
                WHERE i.instructor_id = e.instructor_id AND i.miembro_id = e.miembro_id AND i.estado = 'aceptada'
                ORDER BY i.respondida_en DESC LIMIT 1) AS correo
       FROM escuela.equipos_apoyo e WHERE e.instructor_id = $1::uuid ORDER BY e.creado_en`,
      [instructorId],
    );
    return rows.map((r) => ({ memberId: r.miembro_id, since: r.creado_en, email: r.correo }));
  }

  async findSent(instructorId: string): Promise<SentInvitationRow[]> {
    const rows = await this.dataSource.query<{ id: string; correo: string; expira_en: Date }[]>(
      `SELECT id, correo, expira_en FROM escuela.invitaciones_equipo
       WHERE instructor_id = $1::uuid AND estado = 'pendiente' AND expira_en >= now() ORDER BY creado_en DESC, id DESC`,
      [instructorId],
    );
    return rows.map((r) => ({ id: Number(r.id), email: r.correo, expiresAt: r.expira_en }));
  }

  async findReceived(userId: string): Promise<ReceivedInvitationRow[]> {
    const rows = await this.dataSource.query<{ id: string; instructor: string; creado_en: Date; expira_en: Date }[]>(
      `SELECT i.id, coalesce(p.nombre_publico, 'Un instructor') AS instructor, i.creado_en, i.expira_en
       FROM escuela.invitaciones_equipo i LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = i.instructor_id
       WHERE i.miembro_id = $1::uuid AND i.estado = 'pendiente' AND i.expira_en >= now() ORDER BY i.creado_en DESC, i.id DESC`,
      [userId],
    );
    return rows.map((r) => ({ id: Number(r.id), instructor: r.instructor, createdAt: r.creado_en, expiresAt: r.expira_en }));
  }

  // Las pendientes vencidas de esa persona pasan a `cancelada` para que se pueda volver a invitar.
  async closeExpired(instructorId: string, memberId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE escuela.invitaciones_equipo SET estado = 'cancelada', respondida_en = now()
       WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en < now()`,
      [instructorId, memberId],
    );
  }

  // Crea la invitación salvo que ya sea miembro o ya tenga una vigente. Devuelve también el nombre público del instructor.
  async create(instructorId: string, memberId: string, email: string): Promise<CreateOutcome> {
    let rows: { resultado: string; id: string | null; expira_en: Date | null; instructor: string }[];
    try {
      rows = await this.dataSource.query(
        `WITH miembro AS (SELECT 1 FROM escuela.equipos_apoyo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid),
              vigente AS (SELECT 1 FROM escuela.invitaciones_equipo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en >= now()),
              nueva AS (
                INSERT INTO escuela.invitaciones_equipo (instructor_id, miembro_id, correo)
                SELECT $1::uuid, $2::uuid, $3::text WHERE NOT EXISTS (SELECT 1 FROM miembro) AND NOT EXISTS (SELECT 1 FROM vigente) RETURNING id, expira_en
              )
         SELECT CASE WHEN EXISTS (SELECT 1 FROM miembro) THEN 'ya_es_miembro' WHEN EXISTS (SELECT 1 FROM vigente) THEN 'duplicada' ELSE 'ok' END AS resultado,
                (SELECT id FROM nueva) AS id, (SELECT expira_en FROM nueva) AS expira_en,
                coalesce((SELECT nombre_publico FROM escuela.perfiles_instructor WHERE usuario_id = $1::uuid), 'Un instructor') AS instructor`,
        [instructorId, memberId, email],
      );
    } catch (error) {
      // Dos invitaciones simultáneas: el índice único parcial deja pasar solo una y la otra es una duplicada.
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23505') return { result: 'duplicada' };
      throw error;
    }
    const row = rows[0];
    if (row.resultado === 'ya_es_miembro') return { result: 'ya_es_miembro' };
    if (row.resultado === 'duplicada') return { result: 'duplicada' };
    return { result: 'ok', id: Number(row.id), expiresAt: row.expira_en as Date, instructor: row.instructor };
  }

  // Responde una invitación propia, pendiente y vigente. Al aceptar, entra al equipo y recibe el rol `equipo_apoyo`.
  async answer(invitationId: number, userId: string, accept: boolean): Promise<boolean> {
    const rows = await this.dataSource.query<{ respondida: boolean }[]>(
      `WITH inv AS (SELECT * FROM escuela.invitaciones_equipo WHERE id = $1::bigint AND miembro_id = $2::uuid AND estado = 'pendiente' AND expira_en >= now()),
            resp AS (
              UPDATE escuela.invitaciones_equipo SET estado = CASE WHEN $3::boolean THEN 'aceptada' ELSE 'rechazada' END, respondida_en = now()
              WHERE id IN (SELECT id FROM inv) RETURNING id
            ), equipo AS (
              INSERT INTO escuela.equipos_apoyo (instructor_id, miembro_id) SELECT instructor_id, miembro_id FROM inv WHERE $3::boolean ON CONFLICT DO NOTHING RETURNING 1
            ), rol AS (
              INSERT INTO escuela.roles_usuario (usuario_id, rol) SELECT miembro_id, 'equipo_apoyo' FROM inv WHERE $3::boolean ON CONFLICT DO NOTHING RETURNING 1
            )
       SELECT EXISTS (SELECT 1 FROM resp) AS respondida`,
      [invitationId, userId, accept],
    );
    return rows[0].respondida;
  }

  // Cancela una invitación pendiente del instructor (también si ya venció).
  async cancel(invitationId: number, instructorId: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ cancelada: boolean }[]>(
      `WITH cancelada AS (
         UPDATE escuela.invitaciones_equipo SET estado = 'cancelada', respondida_en = now()
         WHERE id = $1::bigint AND instructor_id = $2::uuid AND estado = 'pendiente' RETURNING id
       )
       SELECT EXISTS (SELECT 1 FROM cancelada) AS cancelada`,
      [invitationId, instructorId],
    );
    return rows[0].cancelada;
  }

  // Quita al miembro del equipo y, si no queda en el equipo de otro instructor, le quita el rol `equipo_apoyo`.
  async removeMember(instructorId: string, memberId: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ quitado: boolean }[]>(
      `WITH quitado AS (DELETE FROM escuela.equipos_apoyo WHERE instructor_id = $1::uuid AND miembro_id = $2::uuid RETURNING miembro_id),
            rol AS (
              DELETE FROM escuela.roles_usuario WHERE usuario_id = $2::uuid AND rol = 'equipo_apoyo' AND EXISTS (SELECT 1 FROM quitado)
                AND NOT EXISTS (SELECT 1 FROM escuela.equipos_apoyo WHERE miembro_id = $2::uuid AND instructor_id <> $1::uuid) RETURNING 1
            )
       SELECT EXISTS (SELECT 1 FROM quitado) AS quitado`,
      [instructorId, memberId],
    );
    return rows[0].quitado;
  }
}
