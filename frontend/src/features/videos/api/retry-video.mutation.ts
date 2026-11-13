import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { stateSchema } from '../schemas/video-status-schema';

const RETRY_VIDEO = graphql(`
  mutation reintentar_video($video_id: EnteroGrande!) {
    reintentar_video(video_id: $video_id) {
      estado
    }
  }
`);

export const retryVideo = (video_id: number) => runGraphql(RETRY_VIDEO, { video_id }, stateSchema);
