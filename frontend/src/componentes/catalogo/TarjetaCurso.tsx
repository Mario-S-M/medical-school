import { urlPortada } from '../../api/portada';
import type { TarjetaCurso as Tarjeta } from '../../api/tipos_catalogo';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const ETIQUETA_NIVEL = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' } as const;

export default function TarjetaCurso({ curso }: { curso: Tarjeta }) {
  const portada = urlPortada(curso.portada_ruta);
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <a href={`/curso?c=${curso.slug}`} className="flex h-full flex-col">
        {portada
          ? <img src={portada} alt="" className="h-36 w-full object-cover" />
          : <div className="h-36 bg-gradient-to-br from-sky-100 to-sky-200" aria-hidden="true" />}
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="font-semibold text-slate-900">{curso.titulo}</h3>
          {curso.subtitulo && <p className="text-sm text-slate-600">{curso.subtitulo}</p>}
          <p className="text-xs text-slate-500">{curso.instructor}{curso.categoria ? ` · ${curso.categoria}` : ''}{curso.nivel ? ` · ${ETIQUETA_NIVEL[curso.nivel]}` : ''}</p>
          <p className="mt-auto pt-2 text-xs text-slate-500">{plural(curso.secciones, 'sección', 'secciones')} · {plural(curso.clases, 'clase', 'clases')}</p>
        </div>
      </a>
    </li>
  );
}
