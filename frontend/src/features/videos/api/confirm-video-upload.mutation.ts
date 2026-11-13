import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { stateSchema } from '../schemas/video-status-schema';

const CONFIRM_VIDEO_UPLOAD = graphql(`
  mutation confirmar_subida_video($video_id: EnteroGrande!) {
    confirmar_subida_video(video_id: $video_id) {
      estado
    }
  }
`);

export const confirmVideoUpload = (video_id: number) => runGraphql(CONFIRM_VIDEO_UPLOAD, { video_id }, stateSchema);
