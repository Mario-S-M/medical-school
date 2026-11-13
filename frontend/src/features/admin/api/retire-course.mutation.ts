import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { stateResultSchema } from '../../courses/schemas/course-schema';

const RETIRE_COURSE = graphql(`
  mutation retirar_curso($curso_id: EnteroGrande!, $comentario: String!) {
    retirar_curso(curso_id: $curso_id, comentario: $comentario) {
      estado
    }
  }
`);

export const retireCourse = (body: { curso_id: number; comentario: string }) => runGraphql(RETIRE_COURSE, body, stateResultSchema);
