import type { InputHTMLAttributes } from 'react';

export type PropsCampo = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  id: string;
  etiqueta: string;
  alCambiar: (valor: string) => void;
  errores?: string[];
};

export default function CampoTexto({ id, etiqueta, alCambiar, errores = [], ...resto }: PropsCampo) {
  const invalido = errores.length > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
      <input
        id={id}
        aria-invalid={invalido}
        aria-describedby={invalido ? `${id}-errores` : undefined}
        onChange={(e) => alCambiar(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-sky-700"
        {...resto}
      />
      <ul id={`${id}-errores`} aria-live="polite" className="text-sm text-red-700">
        {errores.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
