import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchCourseSheet } from '../api/course.query';

export default function useCourseSheet(slug: string) {
  return useQuery({ queryKey: [...queryKeys.courseSheet, slug], queryFn: () => fetchCourseSheet(slug) });
}
