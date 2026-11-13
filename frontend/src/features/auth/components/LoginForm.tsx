import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import PasswordField from '../../../shared/components/ui/PasswordField';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import { zodValidator } from '../../../shared/lib/zod-validator';
import { useLogin } from '../hooks/use-auth-mutations';
import { validateEmail } from '../schemas/email-schema';
import { passwordRequiredSchema } from '../schemas/password-schema';

function LoginForm() {
  const email = useField(validateEmail);
  const password = useField(zodValidator(passwordRequiredSchema));
  const { mutate, isPending, error } = useLogin();
  const { remaining } = useRetryCountdown(error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ([email.validateAndMark(), password.validateAndMark()].every(Boolean)) mutate({ correo: email.value.trim(), contrasena: password.value });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="correo" label="Correo" type="email" autoComplete="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <PasswordField id="contrasena" label="Contraseña" autoComplete="current-password" value={password.value} onValueChange={password.onChange} onBlur={password.onBlur} errors={password.errors} />
      <SubmitButton text="Iniciar sesión" submitting={isPending} remaining={remaining} />
    </form>
  );
}

export default withQueryClient(LoginForm);
