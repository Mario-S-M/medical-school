import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { myTeamSchema } from '../schemas/team-schema';

const MY_TEAM_QUERY = graphql(`
  query mi_equipo {
    mi_equipo {
      miembros {
        miembro_id
        correo
        desde
      }
      invitaciones {
        id
        correo
        expira_en
      }
    }
  }
`);

export const fetchMyTeam = () => runGraphql(MY_TEAM_QUERY, {}, myTeamSchema);
