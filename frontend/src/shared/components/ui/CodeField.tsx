import TextField, { type FieldProps } from './TextField';

export default function CodeField({ onValueChange, ...props }: Omit<FieldProps, 'label'>) {
  return (
    <TextField
      {...props}
      label="Código de 6 dígitos"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      onValueChange={(value) => onValueChange(value.replace(/\D/g, ''))}
    />
  );
}
