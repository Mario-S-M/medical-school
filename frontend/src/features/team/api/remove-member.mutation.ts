import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const REMOVE_MEMBER = graphql(`
  mutation quitar_miembro($miembro_id: ID!) {
    quitar_miembro(miembro_id: $miembro_id) {
      ok
    }
  }
`);

export const removeMember = (miembro_id: string) => runGraphql(REMOVE_MEMBER, { miembro_id }, confirmationSchema);
