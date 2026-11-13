import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import type { Movement } from '../schemas/syllabus-schema';

const MOVE_ITEM = graphql(`
  mutation mover($tipo: String!, $id: EnteroGrande!, $direccion: String!) {
    mover(tipo: $tipo, id: $id, direccion: $direccion) {
      ok
    }
  }
`);

export const moveItem = (body: Movement) => runGraphql(MOVE_ITEM, body, confirmationSchema);
