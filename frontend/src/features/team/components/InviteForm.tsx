import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import { validateEmail } from '../../auth/schemas/email-schema';
import { useInviteMember } from '../hooks/use-team-mutations';

export default function InviteForm() {
  const email = useField(validateEmail);
  const { mutate, isPending, error } = useInviteMember();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.validateAndMark()) mutate(email.value.trim(), { onSuccess: () => email.setValue('') });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-wrap items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="correo_invitado" label="Correo de la persona a invitar" type="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <div className="self-center pt-3"><SubmitButton text="Invitar" submitting={isPending} /></div>
    </form>
  );
}
