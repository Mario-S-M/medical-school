import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import useSession from '../../auth/hooks/use-session';
import { fetchMyInvitations } from '../api/my-invitations.query';

// Un fallo equivale a no tener invitaciones (la sección del panel simplemente no aparece).
export default function useMyInvitations() {
  const enabled = useSession().status === 'authenticated';
  const query = useQuery({ queryKey: queryKeys.myInvitations, queryFn: fetchMyInvitations, enabled, retry: false });
  return { invitations: query.data ?? [] };
}
