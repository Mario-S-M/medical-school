import Button from '../../../shared/components/ui/Button';
import { useLogout } from '../hooks/use-auth-mutations';

export default function LogoutButton() {
  const { mutate } = useLogout();
  return <Button variant="secondary" onClick={() => mutate()}>Cerrar sesión</Button>;
}
