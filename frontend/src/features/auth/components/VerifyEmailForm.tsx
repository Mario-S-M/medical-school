import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import CodeField from '../../../shared/components/ui/CodeField';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import SuccessAlert from '../../../shared/components/ui/SuccessAlert';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import useRetryCountdown from '../../../shared/hooks/use-retry-countdown';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import { useVerifyEmail } from '../hooks/use-email-mutations';
import { readPendingEmail } from '../lib/pending-email';
import { validateCode } from '../schemas/code-schema';
import { validateEmail } from '../schemas/email-schema';
import ResendButton from './ResendButton';

function VerifyEmailForm() {
  const email = useField(validateEmail);
  const code = useField(validateCode);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  useEffect(() => email.setValue(readPendingEmail()), []);
  const { mutate, isPending, error } = useVerifyEmail();
  const { remaining } = useRetryCountdown(error);
  if (done) return (<><SuccessAlert message={notice} /><a href="/iniciar-sesion" className="mt-4 inline-block text-sky-700 underline">Iniciar sesión</a></>);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (![email.validateAndMark(), code.validateAndMark()].every(Boolean)) return;
    mutate({ correo: email.value.trim(), codigo: code.value }, { onSuccess: (r) => (setNotice(r.mensaje), setDone(true)) });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error || resendError ? errorMessage(error ?? resendError) : null} />
      <SuccessAlert message={notice} />
      <TextField id="correo" label="Correo" type="email" autoComplete="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <CodeField id="codigo" value={code.value} onValueChange={code.onChange} onBlur={code.onBlur} errors={[...code.errors, ...fieldDetails(error, 'codigo')]} />
      <SubmitButton text="Verificar correo" submitting={isPending} remaining={remaining} />
      <ResendButton email={email.value} onResent={(m) => { setResendError(null); setNotice(m); }} onFail={setResendError} />
    </form>
  );
}

export default withQueryClient(VerifyEmailForm);
