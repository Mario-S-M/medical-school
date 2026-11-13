import { useEffect } from 'react';
import Button from '../../../shared/components/ui/Button';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { useResendVerification } from '../hooks/use-email-mutations';

const WAIT_SECONDS = 60;

type Props = { email: string; onResent: (message: string) => void; onFail: (error: unknown) => void };

export default function ResendButton({ email, onResent, onFail }: Props) {
  const { mutate, isPending, error } = useResendVerification();
  const { remaining, start } = useRetryCountdown(error);
  useEffect(() => {
    if (error) onFail(error);
  }, [error]);
  const resend = () => mutate({ correo: email.trim() }, { onSuccess: (r) => (start(WAIT_SECONDS), onResent(r.mensaje)) });
  return (
    <Button variant="secondary" disabled={isPending || remaining > 0 || !email.trim()} onClick={resend}>
      {remaining > 0 ? `Reenviar código (${remaining} s)` : 'Reenviar código'}
    </Button>
  );
}
