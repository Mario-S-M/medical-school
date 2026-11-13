import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { answerInvitation } from '../api/answer-invitation.mutation';
import { cancelInvitation } from '../api/cancel-invitation.mutation';
import { inviteMember } from '../api/invite-member.mutation';
import { removeMember } from '../api/remove-member.mutation';

function useInvalidateTeam() {
  const client = useQueryClient();
  return () => Promise.all([queryKeys.myTeam, queryKeys.myInvitations].map((queryKey) => client.invalidateQueries({ queryKey })));
}

export const useInviteMember = () => useMutation({ mutationFn: inviteMember, onSuccess: useInvalidateTeam() });
export const useAnswerInvitation = () => useMutation({ mutationFn: answerInvitation, onSuccess: useInvalidateTeam() });

// Devuelven una función lista para `DeleteButton` (que confirma y muestra el error).
export function useTeamActions() {
  const invalidate = useInvalidateTeam();
  return {
    removeMember: (id: string) => () => removeMember(id).then(invalidate),
    cancelInvitation: (id: number) => () => cancelInvitation(id).then(invalidate),
  };
}
