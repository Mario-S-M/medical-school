import type { SelectHTMLAttributes } from 'react';

type Option = { value: string; text: string };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  id: string;
  label: string;
  options: Option[];
  onValueChange: (value: string) => void;
  errors?: string[];
};

export default function SelectField({ id, label, options, onValueChange, errors = [], ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select
        id={id}
        aria-invalid={errors.length > 0}
        onChange={(e) => onValueChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/30 disabled:bg-slate-100"
        {...rest}
      >
        <option value="">Sin elegir</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </select>
      <ul aria-live="polite" className="text-sm text-red-700">
        {errors.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
