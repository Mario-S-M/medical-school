import { MigrationInterface, QueryRunner } from 'typeorm';

// DDL del equipo de apoyo (SPEC 07).
export class CreateTeam1762900000004 implements MigrationInterface {
  name = 'CrearEquipo1762900000004';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE escuela.equipos_apoyo (
      instructor_id uuid NOT NULL,
      miembro_id uuid NOT NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (instructor_id, miembro_id))`);

    await q.query(`CREATE TABLE escuela.invitaciones_equipo (
      id bigserial PRIMARY KEY,
      instructor_id uuid NOT NULL,
      miembro_id uuid NOT NULL,
      correo text NOT NULL,
      estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
      creado_en timestamptz NOT NULL DEFAULT now(),
      expira_en timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
      respondida_en timestamptz)`);
    await q.query(`CREATE UNIQUE INDEX invitaciones_pendiente_unica ON escuela.invitaciones_equipo (instructor_id, miembro_id) WHERE estado = 'pendiente'`);
    await q.query(`CREATE INDEX invitaciones_miembro_idx ON escuela.invitaciones_equipo (miembro_id, estado)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE escuela.invitaciones_equipo`);
    await q.query(`DROP TABLE escuela.equipos_apoyo`);
  }
}
