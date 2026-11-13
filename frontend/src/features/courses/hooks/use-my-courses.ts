import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchMyCourses } from '../api/my-courses.query';

export default function useMyCourses() {
  return useQuery({ queryKey: queryKeys.myCourses, queryFn: fetchMyCourses });
}
