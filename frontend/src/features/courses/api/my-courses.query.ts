import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { myCoursesSchema } from '../schemas/course-schema';

const MY_COURSES_QUERY = graphql(`
  query mis_cursos {
    mis_cursos {
      id
      slug
      titulo
      estado
      comentario_revision
      portada_ruta
      actualizado_en
      es_mio
      instructor
    }
  }
`);

export const fetchMyCourses = () => runGraphql(MY_COURSES_QUERY, {}, myCoursesSchema);
