import CoverImage from '../../courses/components/CoverImage';
import { LEVEL_LABELS } from '../lib/level-labels';
import type { CourseCardData } from '../schemas/catalog-schema';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <a href={`/curso?c=${course.slug}`} className="flex h-full flex-col">
        <CoverImage
          path={course.portada_ruta}
          alt=""
          className="h-36 w-full object-cover"
          fallback={<div className="h-36 bg-gradient-to-br from-sky-100 to-sky-200" aria-hidden="true" />}
        />
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="font-semibold text-slate-900">{course.titulo}</h3>
          {course.subtitulo && <p className="text-sm text-slate-600">{course.subtitulo}</p>}
          <p className="text-xs text-slate-500">{course.instructor}{course.categoria ? ` · ${course.categoria}` : ''}{course.nivel ? ` · ${LEVEL_LABELS[course.nivel]}` : ''}</p>
          <p className="mt-auto pt-2 text-xs text-slate-500">{plural(course.secciones, 'sección', 'secciones')} · {plural(course.clases, 'clase', 'clases')}</p>
        </div>
      </a>
    </li>
  );
}
