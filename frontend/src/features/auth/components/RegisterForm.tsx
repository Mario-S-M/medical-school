import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import PasswordField from '../../../shared/components/ui/PasswordField';
import RuleList from '../../../shared/components/ui/RuleList';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import { useRegister } from '../hooks/use-auth-mutations';
import { validateEmail } from '../schemas/email-schema';
import { validateName } from '../schemas/name-schema';
import { isPasswordValid, passwordRules } from '../schemas/password-schema';

function RegisterForm() {
  const name = useField(validateName);
  const email = useField(validateEmail);
  const password = useField();
  const { mutate, isPending, error } = useRegister();
  const { remaining } = useRetryCountdown(error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const valid = [name.validateAndMark(), email.validateAndMark()].every(Boolean);
    if (valid && isPasswordValid(password.value, email.value)) {
      mutate({ correo: email.value.trim(), nombre: name.value.trim(), contrasena: password.value });
    }
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="nombre" label="Nombre" autoComplete="name" value={name.value} onValueChange={name.onChange} onBlur={name.onBlur} errors={[...name.errors, ...fieldDetails(error, 'nombre')]} />
      <TextField id="correo" label="Correo" type="email" autoComplete="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <PasswordField id="contrasena" label="Contraseña" autoComplete="new-password" value={password.value} onValueChange={password.onChange} errors={fieldDetails(error, 'contrasena')} />
      <RuleList rules={passwordRules(password.value, email.value)} />
      <SubmitButton text="Crear cuenta" submitting={isPending} remaining={remaining} />
    </form>
  );
}

export default withQueryClient(RegisterForm);
