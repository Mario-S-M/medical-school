import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchMyTeam } from '../api/my-team.query';

export default function useMyTeam() {
  return useQuery({ queryKey: queryKeys.myTeam, queryFn: fetchMyTeam });
}
