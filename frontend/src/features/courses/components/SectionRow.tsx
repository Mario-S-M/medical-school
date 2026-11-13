import { useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import DeleteButton from '../../../shared/components/DeleteButton';
import { useDeleteSection } from '../hooks/use-syllabus-mutations';
import type { Section } from '../schemas/syllabus-schema';
import LessonForm from './LessonForm';
import LessonRow from './LessonRow';
import OrderButtons from './OrderButtons';
import SectionForm from './SectionForm';

type Props = { section: Section; courseId: number; first: boolean; last: boolean; locked: boolean };

export default function SectionRow({ section, courseId, first, last, locked }: Props) {
  const [editing, setEditing] = useState(false);
  const deleteSection = useDeleteSection();
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{section.posicion}. {section.titulo}</h3>
        {!locked && (
          <span className="flex flex-wrap gap-1">
            <OrderButtons type="seccion" id={section.id} name={section.titulo} first={first} last={last} />
            <Button variant="secondary" aria-label={`Renombrar ${section.titulo}`} onClick={() => setEditing(!editing)}>Renombrar</Button>
            <DeleteButton name={section.titulo} action={deleteSection(section.id)} />
          </span>
        )}
      </div>
      {editing && <SectionForm courseId={courseId} section={section} onSaved={() => setEditing(false)} />}
      <ul className="flex flex-col gap-2">
        {section.clases.map((c, i) => (
          <LessonRow key={c.id} lesson={c} sectionId={section.id} first={i === 0} last={i === section.clases.length - 1} locked={locked} />
        ))}
      </ul>
      {!locked && <LessonForm sectionId={section.id} />}
    </li>
  );
}
