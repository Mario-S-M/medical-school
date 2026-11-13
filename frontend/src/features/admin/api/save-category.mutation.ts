import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { idSchema } from '../../courses/schemas/course-schema';

const SAVE_CATEGORY = graphql(`
  mutation guardar_categoria($id: Int, $nombre: String!, $posicion: Int!) {
    guardar_categoria(id: $id, nombre: $nombre, posicion: $posicion) {
      id
    }
  }
`);

export const saveCategory = (body: { id?: number; nombre: string; posicion: number }) => runGraphql(SAVE_CATEGORY, body, idSchema);
