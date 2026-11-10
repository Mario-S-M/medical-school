type Props = { id: string; etiqueta: string; marcado: boolean; alCambiar: (valor: boolean) => void };

export default function CampoCasilla({ id, etiqueta, marcado, alCambiar }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={marcado} onChange={(e) => alCambiar(e.target.checked)} className="h-4 w-4 accent-sky-700" />
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
    </div>
  );
}
