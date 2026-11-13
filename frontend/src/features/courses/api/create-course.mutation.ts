import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { createdCourseSchema } from '../schemas/course-schema';

const CREATE_COURSE = graphql(`
  mutation crear_curso($titulo: String!) {
    crear_curso(titulo: $titulo) {
      id
      slug
    }
  }
`);

export const createCourse = (titulo: string) => runGraphql(CREATE_COURSE, { titulo }, createdCourseSchema);
