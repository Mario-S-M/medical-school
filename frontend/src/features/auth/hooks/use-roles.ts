import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchRoles } from '../api/roles.query';
import type { Roles } from '../schemas/roles-schema';
import useSession from './use-session';

const EMPTY: Roles = { roles: [], equipos: [] };

// Roles del usuario con sesión (una consulta por usuario; un fallo equivale a no tener roles).
export default function useRoles() {
  const userId = useSession().session?.user.id;
  const query = useQuery({ queryKey: queryKeys.roles(userId), queryFn: fetchRoles, enabled: !!userId, staleTime: 5 * 60_000, retry: false });
  return { loading: !!userId && query.isPending, ...(query.data ?? EMPTY) };
}
