import { confirmationSchema, runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';

const DELETE_VIDEO = graphql(`
  mutation borrar_video($clase_id: EnteroGrande!) {
    borrar_video(clase_id: $clase_id) {
      ok
    }
  }
`);

export const deleteVideo = (clase_id: number) => runGraphql(DELETE_VIDEO, { clase_id }, confirmationSchema);
