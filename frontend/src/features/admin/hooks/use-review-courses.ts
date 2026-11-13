import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchReviewCourses } from '../api/review-courses.query';

export default function useReviewCourses() {
  return useQuery({ queryKey: queryKeys.reviewCourses, queryFn: fetchReviewCourses });
}
