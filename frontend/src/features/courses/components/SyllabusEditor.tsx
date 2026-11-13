import type { CourseEdit } from '../schemas/course-schema';
import SectionForm from './SectionForm';
import SectionRow from './SectionRow';

export default function SyllabusEditor({ course }: { course: CourseEdit }) {
  const locked = course.estado === 'en_revision';
  const sections = course.secciones;
  return (
    <section aria-labelledby="titulo-temario" className="flex max-w-2xl flex-col gap-4">
      <h2 id="titulo-temario" className="text-xl font-bold">Temario</h2>
      {locked && <p className="text-sm text-slate-600">El curso está en revisión: el temario no se puede cambiar.</p>}
      {sections.length === 0 && <p className="text-slate-500">Todavía no hay secciones.</p>}
      <ul className="flex flex-col gap-4">
        {sections.map((s, i) => (
          <SectionRow key={s.id} section={s} courseId={course.id} first={i === 0} last={i === sections.length - 1} locked={locked} />
        ))}
      </ul>
      {!locked && <SectionForm courseId={course.id} />}
    </section>
  );
}
