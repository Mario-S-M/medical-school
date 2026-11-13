import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { searchedUserSchema } from '../schemas/review-schema';

const SEARCH_USER_QUERY = graphql(`
  query buscar_usuario($correo: String!) {
    buscar_usuario(correo: $correo) {
      id
      correo
      nombre
      verificado
      roles
    }
  }
`);

export const searchUser = (correo: string) => runGraphql(SEARCH_USER_QUERY, { correo }, searchedUserSchema);
