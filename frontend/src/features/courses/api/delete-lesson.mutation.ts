import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const DELETE_LESSON = graphql(`
  mutation borrar_clase($clase_id: EnteroGrande!) {
    borrar_clase(clase_id: $clase_id) {
      ok
    }
  }
`);

export const deleteLesson = (clase_id: number) => runGraphql(DELETE_LESSON, { clase_id }, confirmationSchema);
