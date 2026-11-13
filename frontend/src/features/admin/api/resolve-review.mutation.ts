import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { stateResultSchema } from '../../courses/schemas/course-schema';
import type { Decision } from '../schemas/review-schema';

const RESOLVE_REVIEW = graphql(`
  mutation resolver_revision($curso_id: EnteroGrande!, $aprobar: Boolean!, $comentario: String) {
    resolver_revision(curso_id: $curso_id, aprobar: $aprobar, comentario: $comentario) {
      estado
    }
  }
`);

export const resolveReview = (body: Decision) => runGraphql(RESOLVE_REVIEW, body, stateResultSchema);
