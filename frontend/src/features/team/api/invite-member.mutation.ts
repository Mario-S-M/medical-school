import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { invitedSchema } from '../schemas/team-schema';

const INVITE_MEMBER = graphql(`
  mutation invitar_equipo($correo: String!) {
    invitar_equipo(correo: $correo) {
      id
      expira_en
      correo_enviado
    }
  }
`);

export const inviteMember = (correo: string) => runGraphql(INVITE_MEMBER, { correo }, invitedSchema);
