export type Rule = { message: string; met: boolean };

export default function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul aria-label="Requisitos de la contraseña" className="space-y-1 text-xs">
      {rules.map((r) => (
        <li key={r.message} className={r.met ? 'text-green-700' : 'text-slate-500'}>
          <span aria-hidden="true">{r.met ? '✓' : '○'}</span> {r.message}
          <span className="sr-only">{r.met ? ' (cumplido)' : ' (pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}
