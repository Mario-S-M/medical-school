import { useMutation, useQueryClient } from '@tanstack/react-query';
import { goTo } from '../../../shared/lib/navigate';
import { queryKeys } from '../../../shared/lib/query-keys';
import { createCourse } from '../api/create-course.mutation';
import { sendToReview } from '../api/send-to-review.mutation';
import { updateCourse } from '../api/update-course.mutation';

// Tras cambiar un curso se invalida su edición y las listas que lo muestran (mis cursos, catálogo y revisión).
function useInvalidateCourses() {
  const client = useQueryClient();
  return () =>
    Promise.all([queryKeys.courseEdit, queryKeys.myCourses, queryKeys.catalog, queryKeys.courseSheet, queryKeys.reviewCourses]
      .map((queryKey) => client.invalidateQueries({ queryKey })));
}

export function useCreateCourse() {
  const invalidate = useInvalidateCourses();
  return useMutation({
    mutationFn: createCourse,
    onSuccess: (course) => {
      void invalidate();
      void goTo(`/instructor/curso?id=${course.id}`);
    },
  });
}

export const useUpdateCourse = () => {
  const invalidate = useInvalidateCourses();
  return useMutation({ mutationFn: updateCourse, onSuccess: invalidate });
};

export const useSendToReview = () => {
  const invalidate = useInvalidateCourses();
  return useMutation({ mutationFn: sendToReview, onSuccess: invalidate });
};
