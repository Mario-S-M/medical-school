import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const CANCEL_INVITATION = graphql(`
  mutation cancelar_invitacion($invitacion_id: EnteroGrande!) {
    cancelar_invitacion(invitacion_id: $invitacion_id) {
      ok
    }
  }
`);

export const cancelInvitation = (invitacion_id: number) => runGraphql(CANCEL_INVITATION, { invitacion_id }, confirmationSchema);
