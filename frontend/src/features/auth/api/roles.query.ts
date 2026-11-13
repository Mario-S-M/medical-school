import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { rolesSchema } from '../schemas/roles-schema';

const ROLES_QUERY = graphql(`
  query mis_roles {
    mis_roles {
      roles
      equipos {
        instructor_id
        nombre_publico
      }
    }
  }
`);

export const fetchRoles = () => runGraphql(ROLES_QUERY, {}, rolesSchema);
