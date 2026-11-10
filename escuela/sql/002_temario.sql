-- Disparadores del temario (SPEC 07): cualquier cambio en secciones o clases actualiza la fecha del curso.
-- Aplicar con el rol de n8n; ver escuela/README.md. Es idempotente.
CREATE OR REPLACE FUNCTION escuela.tocar_curso_de_seccion() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE escuela.cursos SET actualizado_en = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.curso_id ELSE NEW.curso_id END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION escuela.tocar_curso_de_clase() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE escuela.cursos SET actualizado_en = now()
  WHERE id = (SELECT curso_id FROM escuela.secciones
              WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.seccion_id ELSE NEW.seccion_id END);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS secciones_tocar_curso ON escuela.secciones;
CREATE TRIGGER secciones_tocar_curso AFTER INSERT OR UPDATE OR DELETE ON escuela.secciones
  FOR EACH ROW EXECUTE FUNCTION escuela.tocar_curso_de_seccion();

DROP TRIGGER IF EXISTS clases_tocar_curso ON escuela.clases;
CREATE TRIGGER clases_tocar_curso AFTER INSERT OR UPDATE OR DELETE ON escuela.clases
  FOR EACH ROW EXECUTE FUNCTION escuela.tocar_curso_de_clase();
