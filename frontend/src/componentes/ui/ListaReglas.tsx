export type Regla = { mensaje: string; cumplida: boolean };

export default function ListaReglas({ reglas }: { reglas: Regla[] }) {
  return (
    <ul aria-label="Requisitos de la contraseña" className="space-y-1 text-xs">
      {reglas.map((r) => (
        <li key={r.mensaje} className={r.cumplida ? 'text-green-700' : 'text-slate-500'}>
          <span aria-hidden="true">{r.cumplida ? '✓' : '○'}</span> {r.mensaje}
          <span className="sr-only">{r.cumplida ? ' (cumplido)' : ' (pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}
