import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { stateResultSchema } from '../schemas/course-schema';

const SEND_TO_REVIEW = graphql(`
  mutation enviar_revision($curso_id: EnteroGrande!) {
    enviar_revision(curso_id: $curso_id) {
      estado
    }
  }
`);

export const sendToReview = (curso_id: number) => runGraphql(SEND_TO_REVIEW, { curso_id }, stateResultSchema);
