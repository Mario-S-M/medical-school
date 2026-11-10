import type { ResumenCurso } from '../../api/tipos_escuela';
import BannerEstado from './BannerEstado';

export default function TarjetaMiCurso({ curso }: { curso: ResumenCurso }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <a className="text-lg font-semibold text-sky-800 underline-offset-2 hover:underline" href={`/instructor/curso?id=${curso.id}`}>{curso.titulo}</a>
      <p className="text-sm text-slate-500">{curso.es_mio ? 'Tuyo' : `De ${curso.instructor} (equipo de apoyo)`}</p>
      <BannerEstado estado={curso.estado} comentario={curso.comentario_revision} />
    </li>
  );
}
