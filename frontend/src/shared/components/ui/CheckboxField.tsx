type Props = { id: string; label: string; checked: boolean; onValueChange: (value: boolean) => void };

export default function CheckboxField({ id, label, checked, onValueChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onValueChange(e.target.checked)} className="h-4 w-4 accent-sky-700" />
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
    </div>
  );
}
