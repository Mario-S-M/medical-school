export default function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2" role="status">
      <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full bg-sky-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-sm text-slate-600">Subiendo… {percent} %</span>
    </div>
  );
}
