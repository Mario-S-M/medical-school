import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { idSchema } from '../schemas/course-schema';

const SAVE_SECTION = graphql(`
  mutation guardar_seccion($curso_id: EnteroGrande!, $seccion_id: EnteroGrande, $titulo: String!) {
    guardar_seccion(curso_id: $curso_id, seccion_id: $seccion_id, titulo: $titulo) {
      id
    }
  }
`);

export const saveSection = (body: { curso_id: number; seccion_id?: number; titulo: string }) => runGraphql(SAVE_SECTION, body, idSchema);
