import type { InputHTMLAttributes } from 'react';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  errors?: string[];
};

export default function TextField({ id, label, onValueChange, errors = [], ...rest }: FieldProps) {
  const invalid = errors.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input
        id={id}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-errores` : undefined}
        onChange={(e) => onValueChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 transition placeholder:text-slate-400 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/30"
        {...rest}
      />
      <ul id={`${id}-errores`} aria-live="polite" className="text-sm text-red-700">
        {errors.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
