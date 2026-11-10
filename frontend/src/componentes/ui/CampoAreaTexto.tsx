import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  id: string;
  etiqueta: string;
  alCambiar: (valor: string) => void;
  errores?: string[];
  ayuda?: string;
};

export default function CampoAreaTexto({ id, etiqueta, alCambiar, errores = [], ayuda, ...resto }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
      {ayuda && <p id={`${id}-ayuda`} className="text-xs text-slate-500">{ayuda}</p>}
      <textarea
        id={id}
        rows={4}
        aria-invalid={errores.length > 0}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        onChange={(e) => alCambiar(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-visible:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-600/30 disabled:bg-slate-100"
        {...resto}
      />
      <ul aria-live="polite" className="text-sm text-red-700">
        {errores.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
