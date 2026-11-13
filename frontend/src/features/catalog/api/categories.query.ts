import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { categoriesSchema } from '../schemas/catalog-schema';

const CATEGORIES_QUERY = graphql(`
  query categorias {
    categorias {
      id
      nombre
      slug
      posicion
    }
  }
`);

// Pública: se pide sin token.
export const fetchCategories = () => runGraphql(CATEGORIES_QUERY, {}, categoriesSchema, { skipAuth: true });
