import { useMutation, useQueryClient } from '@tanstack/react-query';
import { goTo } from '../../../shared/lib/navigate';
import { queryKeys } from '../../../shared/lib/query-keys';
import { assignRole } from '../api/assign-role.mutation';
import { deleteCategory } from '../api/delete-category.mutation';
import { resolveReview } from '../api/resolve-review.mutation';
import { retireCourse } from '../api/retire-course.mutation';
import { saveCategory } from '../api/save-category.mutation';
import { searchUser } from '../api/search-user.query';

// Búsqueda puntual (no se cachea: son datos de cuentas ajenas).
export const useSearchUser = () => useMutation({ mutationFn: searchUser });
export const useAssignRole = () => useMutation({ mutationFn: assignRole });

function useInvalidate(...keys: (readonly unknown[])[]) {
  const client = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

export const useSaveCategory = () => useMutation({ mutationFn: saveCategory, onSuccess: useInvalidate(queryKeys.categories, queryKeys.catalog) });
export const useDeleteCategory = () => useMutation({ mutationFn: deleteCategory, onSuccess: useInvalidate(queryKeys.categories, queryKeys.catalog) });

// Aprobar o devolver cambia el estado del curso: se refrescan la cola de revisión, el catálogo y las listas del instructor.
export const useResolveReview = () =>
  useMutation({
    mutationFn: resolveReview,
    onSuccess: useInvalidate(queryKeys.reviewCourses, queryKeys.catalog, queryKeys.courseSheet, queryKeys.myCourses, queryKeys.courseEdit),
  });

export function useRetireCourse() {
  const invalidate = useInvalidate(queryKeys.catalog, queryKeys.courseSheet, queryKeys.myCourses, queryKeys.courseEdit, queryKeys.reviewCourses);
  return useMutation({
    mutationFn: retireCourse,
    onSuccess: () => {
      void invalidate();
      void goTo('/cursos');
    },
  });
}
