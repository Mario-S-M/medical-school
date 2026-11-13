import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { idSchema } from '../schemas/course-schema';
import type { LessonData } from '../schemas/syllabus-schema';

const SAVE_LESSON = graphql(`
  mutation guardar_clase(
    $seccion_id: EnteroGrande!
    $clase_id: EnteroGrande
    $titulo: String!
    $descripcion: String
    $duracion_estimada_minutos: Int
    $es_muestra: Boolean!
  ) {
    guardar_clase(
      seccion_id: $seccion_id
      clase_id: $clase_id
      titulo: $titulo
      descripcion: $descripcion
      duracion_estimada_minutos: $duracion_estimada_minutos
      es_muestra: $es_muestra
    ) {
      id
    }
  }
`);

export const saveLesson = (body: LessonData) => runGraphql(SAVE_LESSON, body, idSchema);
