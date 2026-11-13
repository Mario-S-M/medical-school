import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchCategories } from '../api/categories.query';

// Categorías (menú, filtro del catálogo, editor de cursos y administración): una sola consulta compartida.
export default function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: fetchCategories });
}
