import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const DELETE_CATEGORY = graphql(`
  mutation borrar_categoria($id: Int!) {
    borrar_categoria(id: $id) {
      ok
    }
  }
`);

export const deleteCategory = (id: number) => runGraphql(DELETE_CATEGORY, { id }, confirmationSchema);
