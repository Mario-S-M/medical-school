import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { reviewCoursesSchema } from '../schemas/review-schema';

const REVIEW_COURSES_QUERY = graphql(`
  query cursos_en_revision {
    cursos_en_revision {
      id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel
      categoria portada_ruta instructor actualizado_en
      secciones {
        id titulo posicion
        clases { id titulo descripcion duracion_estimada_minutos es_muestra tiene_video posicion }
      }
    }
  }
`);

export const fetchReviewCourses = () => runGraphql(REVIEW_COURSES_QUERY, {}, reviewCoursesSchema);
