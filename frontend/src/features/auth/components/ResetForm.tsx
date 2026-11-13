import { useEffect, type FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import CodeField from '../../../shared/components/ui/CodeField';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import PasswordField from '../../../shared/components/ui/PasswordField';
import RuleList from '../../../shared/components/ui/RuleList';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import { useResetPassword } from '../hooks/use-email-mutations';
import { readPendingEmail } from '../lib/pending-email';
import { validateCode } from '../schemas/code-schema';
import { validateEmail } from '../schemas/email-schema';
import { isPasswordValid, passwordRules } from '../schemas/password-schema';

function ResetForm() {
  const email = useField(validateEmail);
  const code = useField(validateCode);
  const password = useField();
  useEffect(() => email.setValue(readPendingEmail()), []);
  const { mutate, isPending, error } = useResetPassword();
  const { remaining } = useRetryCountdown(error);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const valid = [email.validateAndMark(), code.validateAndMark()].every(Boolean);
    if (valid && isPasswordValid(password.value, email.value)) {
      mutate({ correo: email.value.trim(), codigo: code.value, contrasena_nueva: password.value });
    }
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="correo" label="Correo" type="email" autoComplete="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <CodeField id="codigo" value={code.value} onValueChange={code.onChange} onBlur={code.onBlur} errors={[...code.errors, ...fieldDetails(error, 'codigo')]} />
      <PasswordField id="contrasena" label="Contraseña nueva" autoComplete="new-password" value={password.value} onValueChange={password.onChange} errors={fieldDetails(error, 'contrasena_nueva')} />
      <RuleList rules={passwordRules(password.value, email.value)} />
      <SubmitButton text="Cambiar contraseña" submitting={isPending} remaining={remaining} />
    </form>
  );
}

export default withQueryClient(ResetForm);
