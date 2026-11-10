import { urlPortada } from '../../api/portada';
import { TIPOS_PORTADA } from '../../api/portadas';
import useSubirPortada from '../../hooks/useSubirPortada';
import AlertaError from '../ui/AlertaError';

type Props = { cursoId: number; ruta: string | null; alCambiar: () => void };

export default function SubirPortada({ cursoId, ruta, alCambiar }: Props) {
  const { subir, subiendo, error } = useSubirPortada(cursoId, alCambiar);
  const url = urlPortada(ruta);
  return (
    <section aria-label="Portada" className="flex max-w-2xl flex-col gap-3">
      <h2 className="text-xl font-bold">Portada</h2>
      {url ? <img src={url} alt="Portada del curso" className="h-48 w-full rounded-xl object-cover" /> : <p className="text-slate-500">Todavía no hay portada.</p>}
      <AlertaError mensaje={error} />
      <label htmlFor="portada" className="text-sm font-medium">Elegir imagen (JPG, PNG o WebP, hasta 2 MB)</label>
      <input
        id="portada"
        type="file"
        accept={TIPOS_PORTADA.join(',')}
        disabled={subiendo}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
          e.target.value = '';
        }}
      />
      {subiendo && <p role="status" className="text-sm text-slate-500">Subiendo…</p>}
    </section>
  );
}
