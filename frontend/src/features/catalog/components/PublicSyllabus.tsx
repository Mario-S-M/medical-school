import WatchLink from '../../player/components/WatchLink';
import type { Section } from '../../courses/schemas/syllabus-schema';

// Temario en solo lectura con la etiqueta Muestra. "Ver clase" solo en las muestra (ficha) o en las que tienen video (revisión).
type Props = { sections: Section[]; link?: 'sample' | 'video' };

export default function PublicSyllabus({ sections, link = 'sample' }: Props) {
  return (
    <ol className="flex flex-col gap-3">
      {sections.map((s) => (
        <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="font-semibold">{s.posicion}. {s.titulo}</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {s.clases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span>{c.titulo}</span>
                {c.es_muestra && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Muestra</span>}
                {c.duracion_estimada_minutos && <span className="text-slate-500">{c.duracion_estimada_minutos} min</span>}
                {(link === 'video' ? c.tiene_video : c.es_muestra) && <WatchLink lessonId={c.id} title={c.titulo} />}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
