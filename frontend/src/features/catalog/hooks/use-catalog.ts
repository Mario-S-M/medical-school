import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { searchCourses } from '../api/courses.query';
import type { CatalogQuery } from '../schemas/catalog-schema';

export default function useCatalog(query: CatalogQuery) {
  return useQuery({ queryKey: [...queryKeys.catalog, query], queryFn: () => searchCourses(query) });
}
