import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { userSchema } from '../schemas/session-schema';

const ME_QUERY = graphql(`
  query yo {
    yo {
      id
      correo
      nombre
    }
  }
`);

export const fetchMe = () => runGraphql(ME_QUERY, {}, userSchema);
