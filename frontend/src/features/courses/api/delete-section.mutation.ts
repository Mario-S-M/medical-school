import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const DELETE_SECTION = graphql(`
  mutation borrar_seccion($seccion_id: EnteroGrande!) {
    borrar_seccion(seccion_id: $seccion_id) {
      ok
    }
  }
`);

export const deleteSection = (seccion_id: number) => runGraphql(DELETE_SECTION, { seccion_id }, confirmationSchema);
