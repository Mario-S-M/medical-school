import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { catalogSchema, type CatalogQuery } from '../schemas/catalog-schema';

const COURSES_QUERY = graphql(`
  query cursos($q: String, $categoria: String, $nivel: String, $pagina: Int) {
    cursos(q: $q, categoria: $categoria, nivel: $nivel, pagina: $pagina) {
      total
      pagina
      paginas
      cursos {
        slug
        titulo
        subtitulo
        nivel
        categoria
        categoria_slug
        instructor
        portada_ruta
        secciones
        clases
      }
    }
  }
`);

// Pública: se pide sin token. Los filtros vacíos no se envían.
export const searchCourses = (query: CatalogQuery) =>
  runGraphql(COURSES_QUERY, Object.fromEntries(Object.entries(query).filter(([, value]) => value)), catalogSchema, { skipAuth: true });
