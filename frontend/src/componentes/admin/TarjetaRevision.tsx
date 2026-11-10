import { urlPortada } from '../../api/portada';
import type { CursoRevision } from '../../api/tipos_revision';
import TemarioPublico from '../catalogo/TemarioPublico';
import AccionesRevision from './AccionesRevision';

type Props = { curso: CursoRevision; alResolver: () => void };

export default function TarjetaRevision({ curso, alResolver }: Props) {
  const portada = urlPortada(curso.portada_ruta);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {portada && <img src={portada} alt={`Portada de ${curso.titulo}`} className="h-40 w-full rounded-lg object-cover" />}
      <h2 className="text-xl font-semibold">{curso.titulo}</h2>
      <p className="text-sm text-slate-600">{curso.instructor} · {curso.categoria ?? 'Sin categoría'} · {curso.nivel ?? 'Sin nivel'}</p>
      {curso.subtitulo && <p className="font-medium">{curso.subtitulo}</p>}
      {curso.descripcion && <p className="whitespace-pre-line text-slate-700">{curso.descripcion}</p>}
      {curso.conocimientos_previos && <p className="text-sm"><strong>Conocimientos previos:</strong> {curso.conocimientos_previos}</p>}
      <TemarioPublico secciones={curso.secciones} />
      <AccionesRevision cursoId={curso.id} alResolver={alResolver} />
    </li>
  );
}
