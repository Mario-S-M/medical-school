import type { FormEvent } from 'react';
import { errorMessage, fieldDetails } from '../../../shared/api/error-messages';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import SubmitButton from '../../../shared/components/ui/SubmitButton';
import TextField from '../../../shared/components/ui/TextField';
import useField from '../../../shared/hooks/use-field';
import { validateEmail } from '../../auth/schemas/email-schema';
import { useSearchUser } from '../hooks/use-admin-mutations';
import type { SearchedUser } from '../schemas/review-schema';

export default function UserSearch({ onFound }: { onFound: (user: SearchedUser) => void }) {
  const email = useField(validateEmail);
  const { mutate, isPending, error } = useSearchUser();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.validateAndMark()) mutate(email.value.trim(), { onSuccess: onFound });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-3">
      <ErrorAlert message={error ? errorMessage(error) : null} />
      <TextField id="correo_usuario" label="Correo de la cuenta" type="email" value={email.value} onValueChange={email.onChange} onBlur={email.onBlur} errors={[...email.errors, ...fieldDetails(error, 'correo')]} />
      <SubmitButton text="Buscar cuenta" submitting={isPending} />
    </form>
  );
}
