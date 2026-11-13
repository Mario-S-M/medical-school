import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { answeredSchema } from '../schemas/team-schema';

const ANSWER_INVITATION = graphql(`
  mutation responder_invitacion($invitacion_id: EnteroGrande!, $aceptar: Boolean!) {
    responder_invitacion(invitacion_id: $invitacion_id, aceptar: $aceptar) {
      aceptada
    }
  }
`);

export const answerInvitation = (body: { invitacion_id: number; aceptar: boolean }) => runGraphql(ANSWER_INVITATION, body, answeredSchema);
