import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchCourseEdit } from '../api/course-edit.query';

export default function useCourseEdit(id: number) {
  return useQuery({ queryKey: [...queryKeys.courseEdit, id], queryFn: () => fetchCourseEdit(id) });
}
