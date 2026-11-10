import type { EstadoCurso } from '../../api/tipos_escuela';

const ESTADOS: Record<EstadoCurso, { texto: string; estilo: string }> = {
  borrador: { texto: 'Borrador', estilo: 'bg-slate-100 text-slate-700' },
  en_revision: { texto: 'En revisión', estilo: 'bg-amber-100 text-amber-800' },
  publicado: { texto: 'Publicado', estilo: 'bg-emerald-100 text-emerald-800' },
};

export default function BannerEstado({ estado, comentario }: { estado: EstadoCurso; comentario: string | null }) {
  const { texto, estilo } = ESTADOS[estado];
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className={`w-fit rounded-full px-3 py-1 text-sm font-medium ${estilo}`}>{texto}</span>
      {comentario && estado === 'borrador' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Comentario de la revisión:</strong> {comentario}
        </p>
      )}
    </div>
  );
}
