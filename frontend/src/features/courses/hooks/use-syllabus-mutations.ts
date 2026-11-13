import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { deleteLesson } from '../api/delete-lesson.mutation';
import { deleteSection } from '../api/delete-section.mutation';
import { moveItem } from '../api/move-item.mutation';
import { saveLesson } from '../api/save-lesson.mutation';
import { saveSection } from '../api/save-section.mutation';

// Cada cambio del temario recarga el curso del editor (y el temario público que lo refleje).
function useInvalidateSyllabus() {
  const client = useQueryClient();
  return () => Promise.all([queryKeys.courseEdit, queryKeys.courseSheet].map((queryKey) => client.invalidateQueries({ queryKey })));
}

export const useSaveSection = () => useMutation({ mutationFn: saveSection, onSuccess: useInvalidateSyllabus() });
export const useSaveLesson = () => useMutation({ mutationFn: saveLesson, onSuccess: useInvalidateSyllabus() });
export const useMoveItem = () => useMutation({ mutationFn: moveItem, onSuccess: useInvalidateSyllabus() });

// Devuelven una función lista para `DeleteButton` (que confirma y muestra el error).
export const useDeleteSection = () => {
  const invalidate = useInvalidateSyllabus();
  return (id: number) => () => deleteSection(id).then(invalidate);
};
export const useDeleteLesson = () => {
  const invalidate = useInvalidateSyllabus();
  return (id: number) => () => deleteLesson(id).then(invalidate);
};
