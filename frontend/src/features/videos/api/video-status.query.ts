import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { videoStatusSchema } from '../schemas/video-status-schema';

const VIDEO_STATUS_QUERY = graphql(`
  query estado_video($clase_id: EnteroGrande!) {
    estado_video(clase_id: $clase_id) {
      vigente {
        id
        estado
        duracion_segundos
        listo_en
      }
      nuevo {
        id
        estado
        error
      }
    }
  }
`);

export const fetchVideoStatus = (clase_id: number) => runGraphql(VIDEO_STATUS_QUERY, { clase_id }, videoStatusSchema);
