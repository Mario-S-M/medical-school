import { useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import DeleteButton from '../../../shared/components/DeleteButton';
import VideoLesson from '../../videos/components/VideoLesson';
import { useDeleteLesson } from '../hooks/use-syllabus-mutations';
import type { Lesson } from '../schemas/syllabus-schema';
import LessonForm from './LessonForm';
import OrderButtons from './OrderButtons';

type Props = { lesson: Lesson; sectionId: number; first: boolean; last: boolean; locked: boolean };

export default function LessonRow({ lesson, sectionId, first, last, locked }: Props) {
  const [editing, setEditing] = useState(false);
  const deleteLesson = useDeleteLesson();
  if (editing) {
    return (
      <li className="flex flex-col gap-2">
        <LessonForm sectionId={sectionId} lesson={lesson} onSaved={() => setEditing(false)} />
        <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span>
        {lesson.titulo}
        {lesson.es_muestra && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Muestra</span>}
        {lesson.duracion_estimada_minutos && <span className="ml-2 text-sm text-slate-500">{lesson.duracion_estimada_minutos} min</span>}
      </span>
      {!locked && (
        <span className="flex flex-wrap gap-1">
          <OrderButtons type="clase" id={lesson.id} name={lesson.titulo} first={first} last={last} />
          <Button variant="secondary" aria-label={`Editar ${lesson.titulo}`} onClick={() => setEditing(true)}>Editar</Button>
          <DeleteButton name={lesson.titulo} action={deleteLesson(lesson.id)} />
        </span>
      )}
      {!locked && <div className="w-full"><VideoLesson lesson={lesson} /></div>}
    </li>
  );
}
