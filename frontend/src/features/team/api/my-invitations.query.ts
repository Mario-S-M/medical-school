import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { myInvitationsSchema } from '../schemas/team-schema';

const MY_INVITATIONS_QUERY = graphql(`
  query mis_invitaciones {
    mis_invitaciones {
      id
      instructor
      creado_en
      expira_en
    }
  }
`);

export const fetchMyInvitations = () => runGraphql(MY_INVITATIONS_QUERY, {}, myInvitationsSchema);
