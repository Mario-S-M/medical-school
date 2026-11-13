import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { playbackAuthorizationSchema } from '../schemas/playback-schema';

const AUTHORIZE_PLAYBACK = graphql(`
  mutation autorizar_reproduccion($clase_id: EnteroGrande!) {
    autorizar_reproduccion(clase_id: $clase_id) {
      video_id
      token
      expira_en
      lista_url
      duracion_segundos
      marca_agua
    }
  }
`);

export const authorizePlayback = (lessonId: number) => runGraphql(AUTHORIZE_PLAYBACK, { clase_id: lessonId }, playbackAuthorizationSchema);
