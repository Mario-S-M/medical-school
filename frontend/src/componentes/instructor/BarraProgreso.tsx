export default function BarraProgreso({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="flex items-center gap-2" role="status">
      <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full bg-sky-600 transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
      <span className="text-sm text-slate-600">Subiendo… {porcentaje} %</span>
    </div>
  );
}
