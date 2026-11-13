import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import { useRecover } from '../hooks/use-email-mutations';
import { validateEmail } from '../schemas/email-schema';

function RecoverForm() {
  const email = useField(validateEmail);
  const { mutate, isPending, error } = useRecover();
  const { remaining } = useRetryCountdown(error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.validateAndMark()) mutate({ correo: email.value.trim() });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="correo" label="Correo" type="email" autoComplete="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <SubmitButton text="Enviar código" submitting={isPending} remaining={remaining} />
    </form>
  );
}

export default withQueryClient(RecoverForm);
