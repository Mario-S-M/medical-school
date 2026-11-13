import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  errors?: string[];
  help?: string;
};

export default function TextareaField({ id, label, onValueChange, errors = [], help, ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {help && <p id={`${id}-ayuda`} className="text-xs text-slate-500">{help}</p>}
      <textarea
        id={id}
        rows={4}
        aria-invalid={errors.length > 0}
        aria-describedby={help ? `${id}-ayuda` : undefined}
        onChange={(e) => onValueChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/30 disabled:bg-slate-100"
        {...rest}
      />
      <ul aria-live="polite" className="text-sm text-red-700">
        {errors.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
