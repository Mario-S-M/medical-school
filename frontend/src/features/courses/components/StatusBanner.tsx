import type { CourseState } from '../schemas/course-schema';

const STATES: Record<CourseState, { text: string; style: string }> = {
  borrador: { text: 'Borrador', style: 'bg-slate-100 text-slate-700' },
  en_revision: { text: 'En revisión', style: 'bg-amber-100 text-amber-800' },
  publicado: { text: 'Publicado', style: 'bg-emerald-100 text-emerald-800' },
};

export default function StatusBanner({ state, comment }: { state: CourseState; comment?: string | null }) {
  const { text, style } = STATES[state];
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className={`w-fit rounded-full px-3 py-1 text-sm font-medium ${style}`}>{text}</span>
      {comment && state === 'borrador' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Comentario de la revisión:</strong> {comment}
        </p>
      )}
    </div>
  );
}
