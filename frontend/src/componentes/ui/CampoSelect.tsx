import type { SelectHTMLAttributes } from 'react';

type Opcion = { valor: string; texto: string };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  id: string;
  etiqueta: string;
  opciones: Opcion[];
  alCambiar: (valor: string) => void;
  errores?: string[];
};

export default function CampoSelect({ id, etiqueta, opciones, alCambiar, errores = [], ...resto }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
      <select
        id={id}
        aria-invalid={errores.length > 0}
        onChange={(e) => alCambiar(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/30 disabled:bg-slate-100"
        {...resto}
      >
        <option value="">Sin elegir</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <ul aria-live="polite" className="text-sm text-red-700">
        {errores.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
