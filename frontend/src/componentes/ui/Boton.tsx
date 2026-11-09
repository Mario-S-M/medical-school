import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario';
};

const estilos = {
  primario: 'bg-sky-700 text-white shadow-sm hover:bg-sky-800',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
};

export default function Boton({ variante = 'primario', className = '', ...resto }: Props) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50 ${estilos[variante]} ${className}`}
      {...resto}
    />
  );
}
