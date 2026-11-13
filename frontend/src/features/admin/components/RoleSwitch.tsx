import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { useAssignRole } from '../hooks/use-admin-mutations';
import type { AssignableRole, SearchedUser } from '../schemas/review-schema';

type Props = { user: SearchedUser; role: AssignableRole; label: string; onChange: (user: SearchedUser) => void };

export default function RoleSwitch({ user, role, label, onChange }: Props) {
  const has = user.roles.includes(role);
  const { mutate, isPending, error } = useAssignRole();
  const toggle = () =>
    mutate({ usuario_id: user.id, rol: role, activo: !has }, {
      onSuccess: () => onChange({ ...user, roles: has ? user.roles.filter((r) => r !== role) : [...user.roles, role] }),
    });
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <div className="flex items-center justify-between gap-3">
        <span>{label}: <strong>{has ? 'Sí' : 'No'}</strong></span>
        <Button variant={has ? 'secondary' : 'primary'} disabled={isPending} onClick={toggle}>
          {has ? `Quitar ${label.toLowerCase()}` : `Dar ${label.toLowerCase()}`}
        </Button>
      </div>
    </li>
  );
}
