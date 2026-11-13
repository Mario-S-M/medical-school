import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { z } from 'zod';

const CONFIRM_COVER = graphql(`
  mutation confirmar_portada($curso_id: EnteroGrande!, $ruta: String!) {
    confirmar_portada(curso_id: $curso_id, ruta: $ruta) {
      portada_url
    }
  }
`);

export const confirmCover = (body: { curso_id: number; ruta: string }) =>
  runGraphql(CONFIRM_COVER, body, z.object({ portada_url: z.string() }));
