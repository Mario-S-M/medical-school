import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { courseSheetSchema } from '../schemas/catalog-schema';

const COURSE_QUERY = graphql(`
  query curso($slug: String!) {
    curso(slug: $slug) {
      id
      slug
      titulo
      subtitulo
      descripcion
      conocimientos_previos
      lo_que_aprenderas
      nivel
      categoria {
        nombre
        slug
      }
      portada_ruta
      instructor
      publicado_en
      secciones {
        id
        titulo
        posicion
        clases {
          id
          titulo
          descripcion
          duracion_estimada_minutos
          es_muestra
          posicion
        }
      }
    }
  }
`);

// Pública: se pide sin token.
export const fetchCourseSheet = (slug: string) => runGraphql(COURSE_QUERY, { slug }, courseSheetSchema, { skipAuth: true });
