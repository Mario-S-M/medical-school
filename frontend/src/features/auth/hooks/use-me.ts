import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { fetchMe } from '../api/me.query';
import useSession from './use-session';

// Perfil del usuario (consulta GraphQL `yo`); la clave lleva el id del usuario, así no se comparte entre cuentas.
export default function useMe() {
  const userId = useSession().session?.user.id;
  return useQuery({ queryKey: queryKeys.me(userId), queryFn: fetchMe, enabled: !!userId });
}
