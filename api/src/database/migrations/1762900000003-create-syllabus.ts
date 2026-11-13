import { MigrationInterface, QueryRunner } from 'typeorm';

// DDL del temario (SPEC 07): secciones, clases y los triggers que tocan el curso.
export class CreateSyllabus1762900000003 implements MigrationInterface {
  name = 'CrearTemario1762900000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE escuela.secciones (
      id bigserial PRIMARY KEY,
      curso_id bigint NOT NULL REFERENCES escuela.cursos (id) ON DELETE CASCADE,
      titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
      posicion smallint NOT NULL,
      UNIQUE (curso_id, posicion) DEFERRABLE INITIALLY DEFERRED)`);

    await q.query(`CREATE TABLE escuela.clases (
      id bigserial PRIMARY KEY,
      seccion_id bigint NOT NULL REFERENCES escuela.secciones (id) ON DELETE CASCADE,
      titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
      descripcion text CHECK (length(descripcion) <= 2000),
      duracion_estimada_minutos smallint CHECK (duracion_estimada_minutos BETWEEN 1 AND 180),
      es_muestra boolean NOT NULL DEFAULT false,
      posicion smallint NOT NULL,
      UNIQUE (seccion_id, posicion) DEFERRABLE INITIALLY DEFERRED)`);

    await q.query(`CREATE FUNCTION escuela.tocar_curso_de_seccion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE escuela.cursos SET actualizado_en = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.curso_id ELSE NEW.curso_id END;
  RETURN NULL;
END $$`);
    await q.query(`CREATE TRIGGER secciones_tocar_curso AFTER INSERT OR UPDATE OR DELETE ON escuela.secciones
      FOR EACH ROW EXECUTE FUNCTION escuela.tocar_curso_de_seccion()`);

    await q.query(`CREATE FUNCTION escuela.tocar_curso_de_clase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE escuela.cursos SET actualizado_en = now()
  WHERE id = (SELECT curso_id FROM escuela.secciones
              WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.seccion_id ELSE NEW.seccion_id END);
  RETURN NULL;
END $$`);
    await q.query(`CREATE TRIGGER clases_tocar_curso AFTER INSERT OR UPDATE OR DELETE ON escuela.clases
      FOR EACH ROW EXECUTE FUNCTION escuela.tocar_curso_de_clase()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE escuela.clases`);
    await q.query(`DROP TABLE escuela.secciones`);
    await q.query(`DROP FUNCTION escuela.tocar_curso_de_clase()`);
    await q.query(`DROP FUNCTION escuela.tocar_curso_de_seccion()`);
  }
}
